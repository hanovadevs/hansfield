"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MODELS,
  getModel,
  resolveSettings,
  type Surface,
} from "@/generation/catalog";
import { useStoryboard, restorePlane } from "@/generation/stores/storyboard";
import { uploadMedia } from "@/generation/upload";
import {
  cutOf,
  isStale,
  shotsNeedingGeneration,
  type FilmShot,
  type ContinuityMode,
} from "@/film/types";
import { durationFor, planShots } from "@/film/plan";
import { assemblePlane } from "@/generation/plane";
import { validatePlane } from "@/generation/validate";
import { modelForInput } from "@/generation/catalog/input-mode";
import { generateFilm, type RecordFilmRun } from "@/film/generate";
import { downloadBlob, inspectClip, mediaRequest } from "@/film/client";
import type { RunRecord } from "./history";
import { CloseIcon, PlusIcon, PlayBadgeIcon, DownloadIcon } from "./icons";
import { FilmReview } from "./film-review";
import { cancelGeneration } from "@/generation/client";

const VIDEO_MODELS = MODELS.filter(
  (m) =>
    m.surface === "video" && !m.requiredRoles?.length && m.settings.duration,
);
const secondsLabel = (n: number) => `${n.toFixed(n % 1 ? 1 : 0)}s`;
const activePhase = (shot: FilmShot) =>
  shot.job && !["failed", "interrupted"].includes(shot.job.phase);

export function FilmWorkbench({
  surface,
  history,
  onRecord,
  onError: reportError,
  onBack,
  onEditShot,
}: {
  surface: Surface;
  history: RunRecord[];
  onRecord: RecordFilmRun;
  onError: (error: string | null) => void;
  onBack?: () => void;
  onEditShot?: (id: string) => void;
}) {
  const board = useStoryboard();
  const [step, setStep] = useState<"story" | "shots" | "review" | "export">(
    board.shots.length ? "shots" : "story",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(!board.shots.length);
  const story = board.story;
  const setStory = board.setStory;
  const [target, setTarget] = useState(30);
  const [seconds, setSeconds] = useState(5);
  const [modelId, setModelId] = useState("seedance-2.5");
  const [mode, setMode] = useState<ContinuityMode>("frame");
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const onError = useCallback(
    (message: string | null) => {
      setActionError(message);
      reportError(message);
    },
    [reportError],
  );
  const [libraryId, setLibraryId] = useState("");
  const [format, setFormat] = useState<"landscape" | "portrait" | "square">(
    "landscape",
  );
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [transition, setTransition] = useState<"cut" | "fade">("cut");
  const [muteFilm, setMuteFilm] = useState(false);
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  const [exported, setExported] = useState<{
    url: string;
    duration: number;
    signature: string;
  } | null>(null);
  const exportRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const videoImportRef = useRef<HTMLInputElement>(null);
  const disabled = board.generating || !!working;
  const selected =
    board.shots.find((s) => s.id === selectedId) ?? board.shots[0];
  const selectedIndex = selected
    ? board.shots.findIndex((s) => s.id === selected.id)
    : -1;
  const previous = board.shots[selectedIndex - 1];
  const completed = board.shots.filter((s) => s.clip);
  const available = history.filter(
    (r) => r.kind === "video" && r.status === "completed" && r.urls.length,
  );
  const unfinished = shotsNeedingGeneration(board.shots, board.notes).filter(
    (s) => getModel(s.plane.model).surface === "video",
  );
  const cuts = completed
    .filter((s) => exportIds === null || exportIds.includes(s.id))
    .map((s) => cutOf(s)!);
  const keptDuration = cuts.reduce((n, c) => n + c.end - c.start, 0);
  const cutSignature = JSON.stringify([
    cuts,
    format,
    resolution,
    transition,
    muteFilm,
  ]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z")
        return;
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      event.preventDefault();
      const state = useStoryboard.getState();
      if (!state.generating && !state.editingBusy)
        (event.shiftKey ? state.redo : state.undo)();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const execute = useCallback(
    async (ids: string[]) => {
      onError(null);
      setNotice("");
      try {
        await generateFilm(ids, onRecord);
      } catch (e) {
        if (!(e instanceof Error && e.message === "Watching stopped"))
          onError(e instanceof Error ? e.message : "Could not generate film.");
      }
    },
    [onError, onRecord],
  );

  // Accepted requests are resumed automatically. Uncertain submissions need an explicit resume click.
  useEffect(() => {
    const state = useStoryboard.getState();
    if (state.generating) return;
    for (const shot of state.shots) {
      if (shot.job && ["preparing", "submitting"].includes(shot.job.phase))
        state.patch(shot.id, {
          job: {
            ...shot.job,
            phase: "interrupted",
            error:
              "This submission was interrupted. Resume checks the saved request identifier.",
          },
        });
    }
    const accepted = state.shots.filter(
      (s) =>
        s.job?.requestId && !["failed", "interrupted"].includes(s.job.phase),
    );
    if (!accepted.length || state.generating) return;
    void execute(accepted.map((s) => s.id));
  }, [board.shots, board.generating, execute]);
  useEffect(
    () => () => {
      if (exportRef.current) URL.revokeObjectURL(exportRef.current);
    },
    [],
  );

  async function task(label: string, action: () => Promise<void>) {
    if (disabled) return;
    setWorking(label);
    board.setEditingBusy(true);
    onError(null);
    setNotice("");
    try {
      await action();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update film.");
    } finally {
      setWorking(null);
      useStoryboard.getState().setEditingBusy(false);
    }
  }
  async function addRun(record: RunRecord) {
    const clip = await inspectClip(record.urls[0]!);
    const model = getModel(record.modelId);
    const shot: FilmShot = {
      id: crypto.randomUUID(),
      title: record.prompt.slice(0, 60),
      clip,
      continuity: "none",
      trimStart: 0,
      trimEnd: clip.duration,
      plane: {
        model: model.id,
        prompt: { text: record.prompt },
        media: record.media ?? {},
        settings: resolveSettings(model, record.settings ?? {}),
      },
    };
    board.append([shot]);
    setSelectedId(shot.id);
    setStep("shots");
  }
  function addContinuation() {
    if (!board.shots.length) {
      setPlannerOpen(true);
      return;
    }
    const last = board.shots[board.shots.length - 1]!;
    const sourceModel = getModel(last.plane.model);
    const nextModel =
      sourceModel.roles.start && !sourceModel.requiredRoles?.length
        ? sourceModel
        : getModel("seedance-2.5");
    const shot: FilmShot = {
      id: crypto.randomUUID(),
      title: `Shot ${board.shots.length + 1}`,
      continuity: "frame",
      plane: {
        model: nextModel.id,
        prompt: {
          text: "Continue the ongoing action naturally from the last moment of the previous shot. Move the story forward while preserving the character, setting, lighting and motion.",
        },
        media: {},
        settings: resolveSettings(nextModel, {
          ...last.plane.settings,
          duration: durationFor(nextModel.id, 5),
        }),
      },
    };
    try {
      board.append([shot]);
      setSelectedId(shot.id);
      setStep("shots");
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <section
      className={`studio-board film-workbench film-step-${step}`}
      aria-label="Shot board"
    >
      <div className="studio-section-heading film-heading">
        <div className="studio-board-title">
          <span className="studio-eyebrow">
            {onBack ? (
              <button type="button" disabled={disabled} onClick={onBack}>
                ← All films
              </button>
            ) : (
              "FILM PROJECT"
            )}
          </span>
          <input
            aria-label="Film title"
            maxLength={120}
            value={board.title}
            disabled={disabled}
            onChange={(e) => board.setTitle(e.target.value)}
          />
        </div>
        <div className="studio-board-actions">
          <button
            type="button"
            aria-label="Undo film edit"
            disabled={disabled || !board.undoStack.length}
            onClick={board.undo}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            aria-label="Redo film edit"
            disabled={disabled || !board.redoStack.length}
            onClick={board.redo}
          >
            ↷ Redo
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => importRef.current?.click()}
          >
            Import
          </button>
          <button
            type="button"
            disabled={!board.shots.length || disabled}
            onClick={() =>
              downloadBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        version: 2,
                        title: board.title,
                        notes: board.notes,
                        story: board.story,
                        shots: board.shots.map(({ job, ...shot }) => shot),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                `${board.title.replace(/[^a-z0-9]/gi, "-") || "film"}.jenera.json`,
              )
            }
          >
            Export board
          </button>
        </div>
      </div>
      <div className="film-mode-bar">
        <nav aria-label="Film workflow">
          {(["story", "shots", "review", "export"] as const).map((id, i) => (
            <button
              key={id}
              type="button"
              aria-current={step === id ? "step" : undefined}
              onClick={() => {
                setStep(id);
                if (id === "story") setPlannerOpen(true);
              }}
            >
              <span>0{i + 1}</span>
              {id[0]!.toUpperCase() + id.slice(1)}
            </button>
          ))}
        </nav>
        <span className="film-project-progress">
          {completed.length}/{board.shots.length} ready{" "}
          <i
            style={{
              width: `${board.shots.length ? (completed.length / board.shots.length) * 100 : 0}%`,
            }}
          />
        </span>
      </div>
      {surface === "video" && (
        <>
          <div className="film-intro">
            <div className="film-toolbar">
              <button
                type="button"
                disabled={disabled}
                className="film-primary"
                onClick={() => {
                  setStep("story");
                  setPlannerOpen(true);
                }}
              >
                <PlusIcon size={13} /> Plan a video
              </button>
              <button
                type="button"
                disabled={disabled || board.shots.length >= 40}
                onClick={addContinuation}
              >
                Add next shot <span aria-hidden>↗</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => videoImportRef.current?.click()}
              >
                Upload footage
              </button>
            </div>
          </div>
          {plannerOpen && (
            <div className="film-planner">
              <label className="film-label">
                Your story
                <textarea
                  aria-label="Film story"
                  rows={4}
                  maxLength={20000}
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder={
                    "A traveler follows a winding trail through the desert.\nShe reaches an ancient stone arch at sunset.\nShe steps through the arch into a hidden oasis."
                  }
                />
              </label>
              <p className="film-hint">
                One scene per line. Longer scenes are spread across connected
                shots. You can refine every shot afterward.
              </p>
              <div className="film-settings-row">
                <label className="film-label">
                  Target length
                  <select
                    aria-label="Target film length"
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                  >
                    {[10, 20, 30, 60, 90, 120, 180, 300, 600].map((n) => (
                      <option key={n} value={n}>
                        {n < 60 ? `${n} seconds` : `${n / 60} minutes`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="film-label">
                  Shot length
                  <select
                    aria-label="Planned shot length"
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                  >
                    {[4, 5, 6, 8, 10, 15, 20, 30].map((n) => (
                      <option key={n} value={n}>
                        {n} seconds
                      </option>
                    ))}
                  </select>
                </label>
                <label className="film-label">
                  Model
                  <select
                    aria-label="Film generation model"
                    value={modelId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setModelId(id);
                      setMode(
                        getModel(id).roles.start
                          ? "frame"
                          : getModel(id).roles.video
                            ? "video"
                            : "none",
                      );
                    }}
                  >
                    {VIDEO_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="film-label">
                  Connect shots
                  <select
                    aria-label="Planned continuity"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as ContinuityMode)}
                  >
                    <option value="none">Independent scenes</option>
                    <option
                      value="frame"
                      disabled={!getModel(modelId).roles.start}
                    >
                      Last kept frame
                    </option>
                    <option
                      value="video"
                      disabled={!getModel(modelId).roles.video}
                    >
                      Previous video
                    </option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="film-primary"
                disabled={disabled || !story.trim()}
                onClick={() => {
                  try {
                    const shots = planShots(
                      story,
                      modelId,
                      target,
                      seconds,
                      mode,
                    );
                    board.append(shots);
                    setSelectedId(shots[0]!.id);
                    setPlannerOpen(false);
                    setStep("shots");
                    setNotice(`${shots.length} shots added.`);
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              >
                Create shot plan
              </button>
            </div>
          )}
          <details className="film-notes">
            <summary>Keep characters and style consistent</summary>
            <label className="film-label">
              Shared continuity notes
              <textarea
                aria-label="Shared continuity notes"
                rows={2}
                maxLength={4000}
                disabled={disabled}
                value={board.notes}
                onChange={(e) => board.setNotes(e.target.value)}
                placeholder="Same traveler, sand-colored cloak, dark braided hair. Warm dawn light, restrained film grain. Keep wardrobe, character identity and setting consistent."
              />
            </label>
          </details>
          {available.length > 0 && (
            <div className="film-library-row">
              <select
                aria-label="Choose existing video for film"
                value={libraryId}
                onChange={(e) => setLibraryId(e.target.value)}
                disabled={disabled}
              >
                <option value="">Add a video from your library…</option>
                {available.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.prompt.slice(0, 70)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={disabled || !libraryId}
                onClick={() =>
                  void task("Adding clip…", async () => {
                    const record = available.find((r) => r.id === libraryId)!;
                    await addRun(record);
                    setLibraryId("");
                  })
                }
              >
                Add clip
              </button>
            </div>
          )}
        </>
      )}
      {board.shots.length ? (
        <>
          <div className="film-timeline-caption">
            <span>
              {board.shots.length} shots · {completed.length} ready
            </span>
            <span>
              {secondsLabel(
                completed.reduce((n, s) => {
                  const c = cutOf(s)!;
                  return n + c.end - c.start;
                }, 0),
              )}{" "}
              kept
            </span>
          </div>
          <div
            className="studio-shot-list film-timeline"
            role="list"
            aria-label="Film timeline"
          >
            {board.shots.map((shot, i) => {
              const cut = cutOf(shot);
              const stale = isStale(shot, board.shots[i - 1], board.notes);
              return (
                <article
                  key={shot.id}
                  role="listitem"
                  className={`studio-shot film-shot ${selected?.id === shot.id ? "is-selected" : ""} ${shot.clip ? "has-clip" : ""}`}
                >
                  <button
                    type="button"
                    className="film-shot-select"
                    aria-label={`Edit shot ${i + 1}`}
                    aria-pressed={selected?.id === shot.id}
                    onClick={() => setSelectedId(shot.id)}
                  >
                    {shot.clip && (
                      <video
                        className="film-shot-thumbnail"
                        src={shot.clip.url}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden
                        onLoadedMetadata={(e) => {
                          e.currentTarget.currentTime =
                            cut!.start +
                            Math.min(0.01, (cut!.end - cut!.start) / 2);
                        }}
                      />
                    )}
                    <span className="film-shot-number">
                      {String(i + 1).padStart(2, "0")}
                      {shot.continuity && shot.continuity !== "none" && (
                        <span title="Uses previous shot"> ↳</span>
                      )}
                    </span>
                    <strong>{shot.title}</strong>
                    <span>
                      {shot.job
                        ? shot.job.phase.replace(/_/g, " ")
                        : stale
                          ? "Connection changed"
                          : shot.clip
                            ? `${secondsLabel(cut!.end - cut!.start)} · Ready`
                            : `${shot.plane.settings.duration ?? "Still"}s · Planned`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="studio-shot-load film-load"
                    disabled={disabled}
                    onClick={() => {
                      restorePlane(shot.plane);
                      onEditShot?.(shot.id);
                      document.getElementById("studio-prompt")?.focus();
                    }}
                    aria-label={`Load shot ${i + 1} into composer`}
                  >
                    Direction & references
                  </button>
                  <div className="studio-shot-actions">
                    <button
                      type="button"
                      aria-label={`Move shot ${i + 1} left`}
                      disabled={disabled || i === 0}
                      onClick={() => board.move(shot.id, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label={`Move shot ${i + 1} right`}
                      disabled={disabled || i === board.shots.length - 1}
                      onClick={() => board.move(shot.id, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove shot ${i + 1}`}
                      disabled={disabled}
                      onClick={() => board.remove(shot.id)}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {selected && (
            <FilmShotEditor
              key={selected.id}
              shot={selected}
              index={selectedIndex}
              previous={previous}
              disabled={disabled}
              onError={onError}
              onAdvanced={() => {
                restorePlane(selected.plane);
                onEditShot?.(selected.id);
              }}
              onGenerate={() => void execute([selected.id])}
              onCutDownload={() =>
                void task("Rendering cut…", async () => {
                  const response = await mediaRequest({
                    mode: "trim",
                    clips: [cutOf(selected)!],
                  });
                  downloadBlob(
                    await response.blob(),
                    `jenera-shot-${selectedIndex + 1}.mp4`,
                  );
                })
              }
            />
          )}
          {surface === "video" && (
            <div className="film-generate-row">
              {board.generating ? (
                <button
                  type="button"
                  className="film-primary"
                  disabled={board.stopRequested}
                  onClick={board.stop}
                >
                  {board.stopRequested
                    ? "Stopping after current shot…"
                    : "Stop after current shot"}
                </button>
              ) : (
                <button
                  type="button"
                  className="film-primary"
                  disabled={disabled || !unfinished.length}
                  onClick={() => void execute(unfinished.map((s) => s.id))}
                >
                  Generate remaining ({unfinished.length}){" "}
                  <span aria-hidden>↗</span>
                </button>
              )}
              <p className="film-hint">
                {board.generating
                  ? "Shots run in order so the next one can use the previous result. Keep this tab open; accepted requests recover after refresh."
                  : "One paid request per shot. Changed connections regenerate."}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="studio-board-empty">
          <span className="studio-empty-frame" aria-hidden>
            01
          </span>
          <div>
            <strong>Build a story, one shot at a time.</strong>
            <p>
              Plan a video, add existing footage, or save a scene from the
              composer.
            </p>
          </div>
        </div>
      )}
      {step === "review" && (
        <FilmReview key={board.activeProjectId} shots={board.shots} />
      )}
      {step === "export" && !completed.length && (
        <div className="review-empty">
          <span aria-hidden>↗</span>
          <h2>Ready when your shots are.</h2>
          <p>Generate a shot or add footage before exporting.</p>
          <button className="ux-primary" onClick={() => setStep("shots")}>
            Go to shots
          </button>
        </div>
      )}
      {completed.length > 0 && (
        <div className="film-export">
          <div className="film-export-heading">
            <h3>The final cut</h3>
            <span>
              {secondsLabel(keptDuration)} · {cuts.length}{" "}
              {cuts.length === 1 ? "clip" : "clips"}
              {completed.length < board.shots.length
                ? ` · ${board.shots.length - completed.length} unrendered shots excluded`
                : ""}
            </span>
          </div>
          <div className="film-export-presets">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setFormat("landscape");
                setResolution("1080p");
              }}
            >
              Landscape · 16:9
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setFormat("portrait");
                setResolution("1080p");
              }}
            >
              Short / Reel · 9:16
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setFormat("square");
                setResolution("1080p");
              }}
            >
              Square · 1:1
            </button>
          </div>
          {completed.some((s) =>
            isStale(
              s,
              board.shots[
                board.shots.findIndex((item) => item.id === s.id) - 1
              ],
              board.notes,
            ),
          ) && (
            <p className="film-shot-error">
              Some shots changed since their last generation. This export uses
              their existing clips.
            </p>
          )}
          <label className="film-label">
            Include
            <select
              aria-label="Export scope"
              disabled={disabled}
              value={exportIds === null ? "all" : "selected"}
              onChange={(e) =>
                setExportIds(
                  e.target.value === "all" ? null : completed.map((s) => s.id),
                )
              }
            >
              <option value="all">All ready shots</option>
              <option value="selected">Choose shots for this cut</option>
            </select>
          </label>
          {exportIds !== null && (
            <div className="film-export-picks">
              {completed.map((s, i) => (
                <label key={s.id}>
                  <input
                    type="checkbox"
                    aria-label={`Include shot ${i + 1} in export`}
                    disabled={disabled}
                    checked={exportIds.includes(s.id)}
                    onChange={(e) =>
                      setExportIds((ids) =>
                        e.target.checked
                          ? [...(ids ?? []), s.id]
                          : ids!.filter((id) => id !== s.id),
                      )
                    }
                  />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </label>
              ))}
            </div>
          )}
          <div className="film-settings-row">
            <label className="film-label">
              Canvas
              <select
                aria-label="Film export canvas"
                value={format}
                disabled={disabled}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                <option value="landscape">16:9 landscape</option>
                <option value="portrait">9:16 portrait</option>
                <option value="square">1:1 square</option>
              </select>
            </label>
            <label className="film-label">
              Resolution
              <select
                aria-label="Film export resolution"
                value={resolution}
                disabled={disabled}
                onChange={(e) =>
                  setResolution(e.target.value as typeof resolution)
                }
              >
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </label>
            <label className="film-label">
              Transitions
              <select
                aria-label="Film transitions"
                value={transition}
                disabled={disabled}
                onChange={(e) =>
                  setTransition(e.target.value as typeof transition)
                }
              >
                <option value="cut">Clean cuts</option>
                <option value="fade">Soft crossfades</option>
              </select>
            </label>
            <label className="film-check">
              <input
                type="checkbox"
                aria-label="Mute film audio"
                checked={muteFilm}
                disabled={disabled}
                onChange={(e) => setMuteFilm(e.target.checked)}
              />{" "}
              Mute audio
            </label>
          </div>
          <button
            type="button"
            className="film-primary"
            disabled={disabled || !cuts.length || keptDuration > 600}
            onClick={() =>
              void task("Rendering film…", async () => {
                const response = await mediaRequest({
                  mode: "render",
                  clips: cuts,
                  format,
                  resolution,
                  transition,
                  muted: muteFilm,
                });
                const blob = await response.blob();
                if (exportRef.current) URL.revokeObjectURL(exportRef.current);
                exportRef.current = URL.createObjectURL(blob);
                setExported({
                  url: exportRef.current,
                  duration: Number(response.headers.get("X-Film-Duration")),
                  signature: cutSignature,
                });
                downloadBlob(
                  blob,
                  `${board.title.replace(/[^a-z0-9]/gi, "-") || "film"}.mp4`,
                );
                setNotice("MP4 saved. Exporting uses no generation credits.");
              })
            }
          >
            <DownloadIcon size={13} /> Export film
          </button>
          <p className="film-hint">
            Clips are cut at your chosen times, fitted to one canvas and joined
            into an MP4. Original audio is kept unless muted. Up to 10 minutes
            per export.
          </p>
          {exported && (
            <div className="film-export-preview">
              <video
                src={exported.url}
                controls
                playsInline
                aria-label="Assembled film preview"
              />
              <p>
                {secondsLabel(exported.duration)} ·{" "}
                {exported.signature === cutSignature
                  ? "Current cut"
                  : "Earlier export — export again to include your edits"}
              </p>
            </div>
          )}
        </div>
      )}
      {working && (
        <p className="film-status" role="status">
          {working}
        </p>
      )}
      {notice && (
        <p className="film-status" role="status">
          {notice}
        </p>
      )}
      {actionError && (
        <p className="film-shot-error" role="alert">
          {actionError}
        </p>
      )}
      <input
        type="file"
        ref={importRef}
        hidden
        accept=".json"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 1024 * 1024) {
            onError("Choose a shot board smaller than 1 MB.");
            return;
          }
          void file
            .text()
            .then((text) => {
              board.importBoard(JSON.parse(text));
              setStep("shots");
              setExportIds(null);
              onError(null);
            })
            .catch((e) =>
              onError(
                e instanceof Error ? e.message : "Could not import board.",
              ),
            );
        }}
      />
      <input
        type="file"
        ref={videoImportRef}
        hidden
        accept="video/mp4,.mp4"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void task("Uploading footage…", async () => {
            const uploaded = await uploadMedia(file);
            const clip = await inspectClip(uploaded.url);
            const model = getModel("seedance-2.5");
            const shot: FilmShot = {
              id: crypto.randomUUID(),
              title: file.name.slice(0, 60),
              clip,
              continuity: "none",
              plane: {
                model: model.id,
                prompt: { text: `Continue the scene in ${file.name}.` },
                media: {},
                settings: resolveSettings(model, {}),
              },
            };
            board.append([shot]);
            setSelectedId(shot.id);
            setStep("shots");
          });
        }}
      />
    </section>
  );
}

function FilmShotEditor({
  shot,
  index,
  previous,
  disabled,
  onError,
  onGenerate,
  onCutDownload,
  onAdvanced,
}: {
  shot: FilmShot;
  index: number;
  previous?: FilmShot;
  disabled: boolean;
  onError: (error: string | null) => void;
  onGenerate: () => void;
  onCutDownload: () => void;
  onAdvanced: () => void;
}) {
  const patch = useStoryboard((s) => s.patch);
  const split = useStoryboard((s) => s.split);
  const duplicate = useStoryboard((s) => s.duplicate);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cursor, setCursor] = useState(shot.trimStart ?? 0);
  const [cancelRequested, setCancelRequested] = useState(false);
  useEffect(() => setCancelRequested(false), [shot.job?.requestId]);
  const model = getModel(shot.plane.model);
  const cut = cutOf(shot);
  const busy = disabled || !!activePhase(shot);
  const notes = useStoryboard((s) => s.notes);
  const stale = isStale(shot, previous, notes);
  const updatePrompt = (text: string) =>
    patch(shot.id, { plane: { ...shot.plane, prompt: { text } } });
  const continuation = shot.continuity ?? "none";
  const settingsModel = modelForInput(
    model,
    continuation === "frame"
      ? {
          start: [
            {
              id: "continuity",
              role: "start",
              url: "https://example.com/frame.jpg",
            },
          ],
        }
      : continuation === "video"
        ? {
            video: [
              {
                id: "continuity",
                role: "video",
                url: "https://example.com/clip.mp4",
              },
            ],
          }
        : shot.plane.media,
  );
  function setCut(key: "trimStart" | "trimEnd", time: number) {
    if (!cut || !Number.isFinite(time)) return;
    const start = key === "trimStart" ? time : cut.start;
    const end = key === "trimEnd" ? time : cut.end;
    if (start < 0 || end > shot.clip!.duration || end - start < 0.1) {
      onError("Keep at least 0.1 seconds inside the clip.");
      return;
    }
    patch(shot.id, { [key]: time });
    onError(null);
  }
  return (
    <div className="film-editor" aria-label={`Shot ${index + 1} editor`}>
      <div className="film-editor-heading">
        <h3>Shot {String(index + 1).padStart(2, "0")}</h3>
        <span>
          {model.label}
          {stale ? " · Needs regeneration" : ""}
        </span>
      </div>
      <div className="film-editor-grid">
        {!shot.clip && (
          <div className="film-planned-monitor">
            <span className="studio-eyebrow">
              SHOT {String(index + 1).padStart(2, "0")}
            </span>
            <span className="planned-orbit" aria-hidden />
            <h3>{shot.title}</h3>
            <p>{shot.plane.prompt.text.split("\n")[0]}</p>
            <span>
              {Number(shot.plane.settings.duration ?? 5)}s ·{" "}
              {continuation === "none"
                ? "Independent scene"
                : "Continues previous shot"}
            </span>
          </div>
        )}
        {shot.clip && (
          <div className="film-cut-editor">
            <video
              ref={videoRef}
              src={shot.clip.url}
              controls
              playsInline
              preload="metadata"
              aria-label={`Shot ${index + 1} preview`}
              onLoadedMetadata={(e) => {
                e.currentTarget.currentTime = cut!.start;
                setCursor(cut!.start);
              }}
              onTimeUpdate={(e) => {
                const el = e.currentTarget;
                setCursor(el.currentTime);
                if (!el.paused && cut && el.currentTime >= cut.end) {
                  el.pause();
                  el.currentTime = cut.start;
                }
              }}
              onPlay={(e) => {
                if (
                  cut &&
                  (e.currentTarget.currentTime < cut.start ||
                    e.currentTarget.currentTime >= cut.end)
                )
                  e.currentTarget.currentTime = cut.start;
              }}
            />
            <div className="film-playhead">
              <span>Playhead {secondsLabel(cursor)}</span>
              <span>
                {secondsLabel(cut!.end - cut!.start)} kept of{" "}
                {secondsLabel(shot.clip.duration)}
              </span>
            </div>
            <label className="film-label">
              Trim in
              <input
                type="range"
                aria-label="Trim start"
                min={0}
                max={Math.max(0, cut!.end - 0.1)}
                step={0.05}
                disabled={busy}
                value={cut!.start}
                onChange={(e) => setCut("trimStart", Number(e.target.value))}
              />
            </label>
            <label className="film-label">
              Trim out
              <input
                type="range"
                aria-label="Trim end"
                min={cut!.start + 0.1}
                max={shot.clip.duration}
                step={0.05}
                disabled={busy}
                value={cut!.end}
                onChange={(e) => setCut("trimEnd", Number(e.target.value))}
              />
            </label>
            <div className="film-cut-values">
              <label className="film-label">
                In (s)
                <input
                  type="number"
                  aria-label="Trim start seconds"
                  min={0}
                  max={cut!.end - 0.1}
                  step={0.05}
                  disabled={busy}
                  value={cut!.start}
                  onChange={(e) => setCut("trimStart", e.target.valueAsNumber)}
                />
              </label>
              <label className="film-label">
                Out (s)
                <input
                  type="number"
                  aria-label="Trim end seconds"
                  min={cut!.start + 0.1}
                  max={shot.clip.duration}
                  step={0.05}
                  disabled={busy}
                  value={cut!.end}
                  onChange={(e) => setCut("trimEnd", e.target.valueAsNumber)}
                />
              </label>
              <label className="film-check">
                <input
                  type="checkbox"
                  aria-label="Mute shot audio"
                  disabled={busy}
                  checked={!!shot.muted}
                  onChange={(e) => patch(shot.id, { muted: e.target.checked })}
                />
                Mute shot
              </label>
            </div>
            <input
              type="range"
              aria-label="Shot playhead"
              min={cut!.start}
              max={cut!.end}
              step={0.01}
              disabled={busy}
              value={Math.min(cut!.end, Math.max(cut!.start, cursor))}
              onChange={(e) => {
                const time = Number(e.target.value);
                setCursor(time);
                if (videoRef.current) videoRef.current.currentTime = time;
              }}
            />
            <div className="film-cut-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  try {
                    split(shot.id, cursor);
                    onError(null);
                  } catch (e) {
                    onError((e as Error).message);
                  }
                }}
              >
                Split at playhead
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  patch(shot.id, { trimStart: 0, trimEnd: shot.clip!.duration })
                }
              >
                Reset cuts
              </button>
              <button type="button" disabled={busy} onClick={onCutDownload}>
                Download cut
              </button>
            </div>
          </div>
        )}
        <div className="film-shot-details">
          <label className="film-label">
            Shot name
            <input
              aria-label="Shot name"
              maxLength={60}
              disabled={busy}
              value={shot.title}
              onChange={(e) => patch(shot.id, { title: e.target.value })}
            />
          </label>
          <label className="film-label">
            What happens next?
            <textarea
              aria-label="Shot action"
              rows={4}
              maxLength={9000}
              disabled={busy}
              value={shot.plane.prompt.text}
              onChange={(e) => updatePrompt(e.target.value)}
            />
          </label>
          {model.surface === "video" && (
            <>
              <div className="film-settings-row">
                <label className="film-label">
                  Model
                  <select
                    aria-label="Shot model"
                    disabled={busy}
                    value={model.id}
                    onChange={(e) => {
                      const next = getModel(e.target.value);
                      patch(shot.id, {
                        continuity: next.roles.start
                          ? continuation
                          : next.roles.video && continuation !== "none"
                            ? "video"
                            : "none",
                        plane: {
                          ...shot.plane,
                          model: next.id,
                          media: {},
                          settings: resolveSettings(next, {
                            ...shot.plane.settings,
                            duration: durationFor(
                              next.id,
                              Number(shot.plane.settings.duration ?? 5),
                            ),
                          }),
                        },
                      });
                    }}
                  >
                    {VIDEO_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="film-label">
                  Connection
                  <select
                    aria-label="Shot continuity"
                    disabled={busy}
                    value={continuation}
                    onChange={(e) =>
                      patch(shot.id, {
                        continuity: e.target.value as ContinuityMode,
                      })
                    }
                  >
                    <option value="none">Independent shot</option>
                    <option
                      value="frame"
                      disabled={index === 0 || !model.roles.start}
                    >
                      Previous final frame
                    </option>
                    <option
                      value="video"
                      disabled={index === 0 || !model.roles.video}
                    >
                      Previous video reference
                    </option>
                  </select>
                </label>
              </div>
              <div className="film-settings-row">
                {["duration", "resolution", "aspectRatio"].map((key) => {
                  const field = settingsModel.settings[key];
                  if (!field || field.type === "boolean") return null;
                  const label =
                    key === "duration"
                      ? "Duration (s)"
                      : key === "resolution"
                        ? "Resolution"
                        : "Aspect ratio";
                  return (
                    <label key={key} className="film-label">
                      {label}
                      {field.type === "enum" ? (
                        <select
                          aria-label={`Shot ${label.toLowerCase()}`}
                          disabled={busy}
                          value={String(
                            shot.plane.settings[key] ?? field.default,
                          )}
                          onChange={(e) =>
                            patch(shot.id, {
                              plane: {
                                ...shot.plane,
                                settings: resolveSettings(settingsModel, {
                                  ...shot.plane.settings,
                                  [key]: e.target.value,
                                }),
                              },
                            })
                          }
                        >
                          {field.values.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          aria-label={`Shot ${label.toLowerCase()}`}
                          disabled={busy}
                          min={field.min}
                          max={field.max}
                          step={field.step ?? 1}
                          value={Number(
                            shot.plane.settings[key] ?? field.default,
                          )}
                          onChange={(e) => {
                            const value = e.target.valueAsNumber;
                            if (
                              Number.isFinite(value) &&
                              value >= field.min &&
                              value <= field.max
                            )
                              patch(shot.id, {
                                plane: {
                                  ...shot.plane,
                                  settings: resolveSettings(settingsModel, {
                                    ...shot.plane.settings,
                                    [key]: value,
                                  }),
                                },
                              });
                          }}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              {continuation !== "none" && (
                <p className="film-continuity-note">
                  {previous?.clip
                    ? `Uses shot ${index}'s ${continuation === "frame" ? "last kept frame as the opening frame" : "kept ending as a video reference"}.`
                    : `Waiting for shot ${index} to finish.`}{" "}
                  {stale
                    ? "Scene settings or the previous reference changed. Regenerate to update this shot."
                    : ""}
                </p>
              )}
              {shot.job?.error && (
                <p className="film-shot-error" role="alert">
                  {shot.job.error}
                </p>
              )}
              <div className="film-cut-actions">
                {activePhase(shot) && shot.job?.requestId && (
                  <button
                    type="button"
                    disabled={cancelRequested}
                    onClick={() => {
                      setCancelRequested(true);
                      void cancelGeneration(shot.job!.requestId!).catch(
                        (error) => {
                          setCancelRequested(false);
                          onError((error as Error).message);
                        },
                      );
                    }}
                  >
                    {cancelRequested ? "Cancellation requested" : "Cancel shot"}
                  </button>
                )}
                <button
                  type="button"
                  className="film-primary"
                  disabled={
                    busy ||
                    !shot.plane.prompt.text.trim() ||
                    (continuation !== "none" && !previous?.clip)
                  }
                  onClick={onGenerate}
                >
                  <PlayBadgeIcon size={13} />
                  {shot.job?.phase === "interrupted"
                    ? "Resume shot"
                    : shot.clip
                      ? "Regenerate shot"
                      : "Generate shot"}
                </button>
                <button type="button" disabled={busy} onClick={onAdvanced}>
                  Advanced direction
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="film-apply-legacy"
                  onClick={() => {
                    try {
                      const plane = validatePlane(assemblePlane());
                      const next = getModel(plane.model);
                      if (next.surface !== "video")
                        throw new Error(
                          "Choose a video model in the composer first.",
                        );
                      const connection =
                        (continuation === "frame" && !next.roles.start) ||
                        (continuation === "video" && !next.roles.video)
                          ? "none"
                          : continuation;
                      patch(shot.id, { plane, continuity: connection });
                      onError(null);
                    } catch (error) {
                      onError((error as Error).message);
                    }
                  }}
                >
                  Use composer settings
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    try {
                      duplicate(shot.id);
                    } catch (e) {
                      onError((e as Error).message);
                    }
                  }}
                >
                  Duplicate
                </button>
              </div>
              <p className="film-hint">
                {shot.job && activePhase(shot)
                  ? `Higgsfield: ${shot.job.phase.replace(/_/g, " ")}`
                  : `Generation uses one paid request. ${Number(shot.plane.settings.duration ?? 5)} seconds requested.`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
