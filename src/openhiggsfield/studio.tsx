"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BRAND_NAME, BRAND_MARK } from "@/brand";
import {
  MODELS,
  resolveSettings,
  type ModelEntry,
  type Surface,
} from "@/generation/catalog";
import { assemblePlane } from "@/generation/plane";
import { validatePlane } from "@/generation/validate";
import { toPlatform } from "@/generation/to-platform";
import { modelForInput, modelReference } from "@/generation/catalog/input-mode";
import { useActive } from "@/generation/stores/active";
import { useImagePrompt, useVideoPrompt } from "@/generation/stores/prompt";
import { useSettings } from "@/generation/stores/settings";
import { useStoryboard } from "@/generation/stores/storyboard";
import { AssetPicker } from "./asset-picker";
import { MediaStrip, useMediaTray } from "./media-tray";
import { ModelIcon } from "./model-icon";
import {
  countSetting,
  describeModel,
  ROLE_LABELS,
  settingLabel,
  type GalleryView,
} from "./data";
import { CloseIcon, PlusIcon, PlayBadgeIcon, DownloadIcon } from "./icons";
import { fileNameFor, saveFile } from "./download";
import type { RunRecord } from "./history";

const GUIDES: Record<string, { tag: string; text: string }> = {
  "cinema-4": {
    tag: "Director’s choice",
    text: "Native lens, camera, light and pacing controls. Add reference images to establish a consistent visual world. Output up to 720p.",
  },
  "seedance-2.5": {
    tag: "Reference driven",
    text: "Combine image, video and audio references for a 4–30 second shot. Use frame conditioning or references in separate runs. Up to 1080p.",
  },
  "kling-3-pro": {
    tag: "Frame control",
    text: "Control the opening and closing frame, enable sound, and generate 3–15 second shots. Describe one clear action for a focused result.",
  },
  "kling-3-4k": {
    tag: "High resolution",
    text: "Native 4K delivery with optional sound and first/last frame conditioning. Keep your composition deliberate.",
  },
  genjutsu: {
    tag: "Motion transfer",
    text: "Transfer the motion of an MP4 source (at least 4 seconds) to 1–8 image references. Output follows the source, up to 30 seconds.",
  },
  "seedance-2.5-edit": {
    tag: "Edit footage",
    text: "Attach a source video and describe what should change. Add image references to guide the edit.",
  },
  "seedance-2.5-extend": {
    tag: "Continue a scene",
    text: "Attach a source video and describe how the action continues. Match the original light, camera movement and subject.",
  },
};
const PRESETS = [
  {
    name: "The quiet epic",
    kind: "Landscape / atmosphere",
    scene:
      "A lone traveler in a sand-colored cloak walks across vast desert dunes at dawn. Wind lifts fine sand from the ridges. Begin wide, slowly reveal the scale of the landscape. Keep the traveler consistent throughout.",
    settings: {
      cameraMovement: "aerial-pullback",
      cameraLens: "anamorphic",
      light: "contre-jour",
      pacing: "calm",
      genre: "epic",
      colorPalette: "amber-wasteland",
    },
    color: "sand",
  },
  {
    name: "After hours",
    kind: "Narrative / city",
    scene:
      "A woman in a dark coat crosses a rain-soaked Tokyo street at night. Neon signs reflect in puddles. Track her steadily at shoulder height, with natural footsteps and distant traffic. A single continuous shot.",
    settings: {
      cameraMovement: "tracking",
      cameraLens: "vintage-anamorphic",
      light: "practicals",
      pacing: "single-shot",
      genre: "noir",
      colorPalette: "neon-rain-at-midnight",
    },
    color: "night",
  },
  {
    name: "Object of desire",
    kind: "Product / detail",
    scene:
      "A sculptural brushed-aluminum perfume bottle stands on a black stone pedestal. A soft strip of light travels across the curved metal as the camera moves slowly closer. Preserve the bottle's shape. Restrained, premium product photography.",
    settings: {
      cameraMovement: "dolly-in",
      cameraLens: "clean-sharp",
      light: "soft-cross",
      pacing: "calm",
      genre: "drama",
      colorPalette: "industrial-fog",
    },
    color: "object",
  },
] as const;
const IMAGE_PRESETS = [
  {
    name: "Portrait study",
    kind: "Portrait / natural light",
    color: "sand",
    scene:
      "An editorial portrait of a beekeeper in a sunlit orchard, medium format film, soft natural light, fine detail and a quiet expression.",
    settings: {},
  },
  {
    name: "Night in the city",
    kind: "Street / atmosphere",
    color: "night",
    scene:
      "A rain-slick Tokyo street at night, soft neon reflections, a single pedestrian with a dark umbrella, 35mm film, coherent street photography.",
    settings: {},
  },
  {
    name: "Still, with character",
    kind: "Product / composition",
    color: "object",
    scene:
      "A sculptural ceramic bottle on a stone pedestal, soft side light, olive backdrop, carefully balanced editorial still life, premium product photography.",
    settings: {},
  },
] as const;

export function StudioHeader({
  view,
  onView,
  busy,
  keyConfigured,
  onKeys,
  workspace = "studio",
  onFilms,
  navigationDisabled = false,
}: {
  view: GalleryView;
  onView: (view: GalleryView) => void;
  busy: boolean;
  keyConfigured: boolean;
  onKeys: () => void;
  workspace?: "studio" | "films";
  onFilms?: () => void;
  navigationDisabled?: boolean;
}) {
  return (
    <header className="studio-header">
      <a className="studio-brand" href="/" aria-label={`${BRAND_NAME} home`}>
        <img
          className="jenera-mark"
          src={BRAND_MARK}
          width="38"
          height="38"
          alt=""
        />
        <span className="jenera-wordmark">{BRAND_NAME}</span>
      </a>
      <nav className="studio-navigation" aria-label="Workspace">
        {(["video", "assets", "favorites"] as GalleryView[]).map((id) => (
          <button
            key={id}
            id={`ohf-tab-${id}`}
            type="button"
            disabled={navigationDisabled}
            aria-current={
              workspace === "studio" &&
              (view === id || (id === "video" && view === "image"))
                ? "page"
                : undefined
            }
            onClick={() => onView(id)}
          >
            {
              {
                video: "Studio",
                image: "Image studio",
                assets: "Library",
                favorites: "Favorites",
              }[id]
            }
          </button>
        ))}
        <button
          type="button"
          className="nav-films"
          aria-current={workspace === "films" ? "page" : undefined}
          disabled={navigationDisabled}
          onClick={onFilms}
        >
          Films
        </button>
      </nav>
      <a className="studio-help" href="/help" target="_blank" rel="noreferrer">
        Help
      </a>
      <button className="studio-connection" type="button" onClick={onKeys}>
        <span className="studio-connection-mark" aria-hidden>
          {keyConfigured ? "↗" : "+"}
        </span>
        {keyConfigured ? "Higgsfield connected" : "Connect Higgsfield"}
        {busy && <span className="studio-working">Working</span>}
      </button>
    </header>
  );
}

export function StudioComposer({
  surface,
  model: baseModel,
  generating,
  error,
  focusNonce,
  history,
  notice,
  selection,
  selecting,
  onError,
  onGenerate,
  filmShotId,
  onApplied,
  onSaveToFilm,
}: {
  surface: Surface;
  model: ModelEntry;
  generating: boolean;
  error: string | null;
  focusNonce: number;
  history: RunRecord[];
  notice?: ReactNode;
  selection: ReactNode;
  selecting: boolean;
  onError: (message: string | null) => void;
  onGenerate: () => Promise<void>;
  filmShotId?: string;
  onApplied?: () => void;
  onSaveToFilm?: () => void;
}) {
  const setModel = useActive((s) => s.setModel);
  const batch = useActive((s) => s.batch);
  const setBatch = useActive((s) => s.setBatch);
  const imagePrompt = useImagePrompt();
  const videoPrompt = useVideoPrompt();
  const prompt = surface === "image" ? imagePrompt : videoPrompt;
  const tray = useMediaTray(baseModel, onError);
  const media = Object.fromEntries(
    Object.keys(baseModel.roles).map((role) => [
      role,
      tray.items.filter((item) => item.role === role),
    ]),
  );
  const model = modelForInput(baseModel, media);
  const referenceUrl = modelReference(baseModel, media);
  const raw = useSettings((s) => s.byModel[baseModel.id]);
  const setSettings = useSettings((s) => s.set);
  const values = resolveSettings(model, raw ?? {});
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const guide = GUIDES[model.id];
  const native = countSetting(model);
  const basicKeys = ["aspectRatio", "duration", "resolution", "outputFormat"];
  const creativeKeys = Object.keys(model.settings).filter(
    (key) =>
      !basicKeys.includes(key) &&
      !["generateAudio", "sound", "batchSize", "numImages"].includes(key),
  );
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (focusNonce) promptRef.current?.focus();
  }, [focusNonce]);
  useEffect(() => {
    setAssetsOpen(false);
  }, [model.id]);
  useEffect(() => {
    if (!receipt) return;
    const timer = setTimeout(() => setReceipt(""), 2500);
    return () => clearTimeout(timer);
  }, [receipt]);

  function renderSetting(key: string) {
    if (
      key === "outputFormat" &&
      model.id.startsWith("seedance") &&
      tray.items.some((item) => model.roles[item.role])
    )
      return null;
    const field = model.settings[key];
    if (!field) return null;
    const value = values[key] ?? field.default;
    if (field.type === "boolean")
      return (
        <label key={key} className="studio-toggle">
          <span>{settingLabel(key)}</span>
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => setSettings(model.id, { [key]: e.target.checked })}
          />
        </label>
      );
    return (
      <label className="studio-field" key={key}>
        <span>{settingLabel(key)}</span>
        {field.type === "enum" ? (
          <select
            aria-label={settingLabel(key)}
            value={String(value)}
            onChange={(e) => setSettings(model.id, { [key]: e.target.value })}
          >
            {field.optional && <option value="">Director decides</option>}
            {field.values.map((v) => (
              <option key={v} value={v}>
                {v
                  .replace(/-/g, " ")
                  .replace(/^f14 /, "f/1.4 ")
                  .replace(/^f4 /, "f/4 ")
                  .replace(/^f11 /, "f/11 ")}
              </option>
            ))}
          </select>
        ) : (
          <div className="studio-range">
            <input
              aria-label={settingLabel(key)}
              type="range"
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={Number(value)}
              onChange={(e) =>
                setSettings(model.id, { [key]: Number(e.target.value) })
              }
            />
            <output>
              {String(value)}
              {key === "duration" ? "s" : ""}
            </output>
          </div>
        )}
      </label>
    );
  }
  async function submit() {
    if (submitting || tray.uploading) return;
    try {
      const plane = validatePlane(assemblePlane());
      toPlatform(plane);
      if (filmShotId) {
        const shot = useStoryboard
          .getState()
          .shots.find((s) => s.id === filmShotId);
        if (!shot) throw new Error("This shot is no longer in the project.");
        if (model.surface !== "video")
          throw new Error("Choose a video model for this shot.");
        const continuity =
          (shot.continuity === "frame" && !model.roles.start) ||
          (shot.continuity === "video" && !model.roles.video)
            ? "none"
            : shot.continuity;
        useStoryboard.getState().patch(filmShotId, { plane, continuity });
        onApplied?.();
        return;
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Check the shot inputs.");
      return;
    }
    setSubmitting(true);
    try {
      await onGenerate();
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <aside className="studio-composer" aria-label="Shot settings">
      <div className="studio-composer-scroll">
        {!filmShotId && (
          <div className="studio-surface-switch">
            <button
              aria-label="Video studio"
              aria-pressed={surface === "video"}
              onClick={() => setModel("cinema-4")}
            >
              Video
            </button>
            <button
              aria-label="Image studio"
              aria-pressed={surface === "image"}
              onClick={() => setModel("soul-2")}
            >
              Image
            </button>
          </div>
        )}
        <h1 className="studio-composer-title">
          {filmShotId ? (
            <>
              Direct the <em>shot.</em>
            </>
          ) : surface === "video" ? (
            <>
              Make it <em>move.</em>
            </>
          ) : (
            <>
              Make a <em>picture.</em>
            </>
          )}
        </h1>
        <label className="studio-prompt-label" htmlFor="studio-prompt">
          {surface === "video" ? "Describe your scene" : "Describe your image"}
          <span>{prompt.text.length.toLocaleString()} / 10,000</span>
        </label>
        <textarea
          id="studio-prompt"
          disabled={!ready}
          aria-label={
            surface === "video" ? "Describe your scene" : "Describe your image"
          }
          ref={promptRef}
          className="studio-prompt"
          value={prompt.text}
          maxLength={10000}
          placeholder={
            surface === "video"
              ? "A subject, an action, a world.\nWhat does the camera see?"
              : "Describe the subject, composition and light…"
          }
          onChange={(e) => {
            prompt.setText(e.target.value);
            onError(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />

        <section className="studio-section">
          <div className="studio-section-heading">
            <h2>Choose your model</h2>
            <span className="studio-small">
              {MODELS.filter((m) => m.surface === surface).length} models
            </span>
          </div>
          <label className="studio-model-select">
            <ModelIcon modelId={model.id} size={21} />
            <select
              disabled={!ready}
              aria-label="Generation model"
              value={model.id}
              onChange={(e) => {
                setModel(e.target.value);
                onError(null);
              }}
            >
              {MODELS.filter((m) => m.surface === surface).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <details className="studio-model-guide">
            <summary>{guide?.tag ?? "Model capabilities"}</summary>
            <p>{guide?.text ?? describeModel(model)}</p>
            {referenceUrl && (
              <a href={referenceUrl} target="_blank" rel="noreferrer">
                Model reference ↗
              </a>
            )}
          </details>
          {surface === "video" && (
            <div className="studio-model-shortcuts">
              {[
                ["cinema-4", "Cinema"],
                ["seedance-2.5", "Seedance"],
                ["kling-3-pro", "Kling Pro"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={model.id === id}
                  onClick={() => setModel(id!)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="studio-section">
          <div className="studio-section-heading">
            <h2>Output</h2>
          </div>
          <div className="studio-setting-grid">
            {basicKeys.map(renderSetting)}
          </div>
          {["generateAudio", "sound"].map(renderSetting)}
          <label className="studio-field studio-variations">
            <span>
              Variations{" "}
              <small>
                {native ? "One batch request" : "One paid request each"}
              </small>
            </span>
            <select
              aria-label="Variations"
              value={native ? String(values[native.key]) : String(batch)}
              onChange={(e) => {
                if (native)
                  setSettings(model.id, {
                    [native.key]:
                      native.kind === "enum"
                        ? e.target.value
                        : Number(e.target.value),
                  });
                else setBatch(Number(e.target.value));
              }}
            >
              {(native?.counts ?? [1, 2, 3, 4]).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "variation" : "variations"}
                </option>
              ))}
            </select>
          </label>
        </section>
        {creativeKeys.length > 0 && (
          <details className="studio-section studio-creative">
            <summary>
              <span>Creative controls</span>
              <span className="studio-small">
                {model.id === "cinema-4" ? "Native direction" : "Fine tune"} +
              </span>
            </summary>
            <div className="studio-setting-grid">
              {creativeKeys.map(renderSetting)}
            </div>
          </details>
        )}
        <section className="studio-section">
          <div className="studio-section-heading">
            <h2>References</h2>
          </div>
          {tray.roles.length ? (
            <>
              <button
                type="button"
                className="studio-attach"
                onClick={() => setAssetsOpen(true)}
                disabled={tray.uploading}
              >
                <PlusIcon size={15} />
                {tray.uploading
                  ? "Uploading reference…"
                  : "Add frames, files or past creations"}
              </button>
              <div className="studio-reference-roles">
                {tray.roles.map((role) => (
                  <span key={role}>
                    {ROLE_LABELS[role]}
                    {model.requiredRoles?.includes(role) ? " *" : ""}
                  </span>
                ))}
              </div>
              <MediaStrip model={model} />
            </>
          ) : (
            <p className="studio-reference-hint">
              This model uses your prompt without reference images.
            </p>
          )}
          {tray.items.some((item) => !model.roles[item.role]) && (
            <p className="studio-reference-hint">
              Some saved references aren’t supported by this model. They will be
              left out of this run.
            </p>
          )}
        </section>
        {!filmShotId && surface === "video" && (
          <button
            className="studio-save-shot"
            type="button"
            disabled={!prompt.text.trim()}
            onClick={() => {
              try {
                useStoryboard.getState().add(validatePlane(assemblePlane()));
                setReceipt("Shot saved to your board");
                onSaveToFilm?.();
              } catch (e) {
                onError(
                  e instanceof Error ? e.message : "Check the shot inputs.",
                );
              }
            }}
          >
            <PlusIcon size={14} /> Add to film
          </button>
        )}
        {receipt && (
          <p className="studio-receipt" role="status">
            {receipt}
          </p>
        )}
        {tray.input}
      </div>
      <div className="studio-submit-area">
        {notice}
        {error && (
          <div className="studio-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => onError(null)}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}
        {selecting ? (
          selection
        ) : (
          <>
            <button
              type="button"
              className="studio-generate"
              disabled={!prompt.text.trim() || tray.uploading || submitting}
              onClick={() => void submit()}
            >
              <span>
                {submitting
                  ? "Submitting…"
                  : filmShotId
                    ? "Apply to shot"
                    : surface === "video"
                      ? "Generate video"
                      : "Generate image"}
              </span>
              <span aria-hidden>↗</span>
            </button>
            <div className="studio-submit-caption">
              <span>
                {filmShotId
                  ? "Settings apply to this shot"
                  : generating
                    ? "Generating in background"
                    : "Generation uses your API balance"}
              </span>
              <kbd>Ctrl ↵</kbd>
            </div>
          </>
        )}
      </div>
      {assetsOpen && (
        <AssetDialog onClose={() => setAssetsOpen(false)}>
          <AssetPicker
            key={model.id}
            model={model}
            items={tray.items}
            uploads={tray.uploads}
            history={history}
            staged={tray.staged}
            uploading={tray.uploading}
            onUpload={tray.begin}
            onApply={tray.apply}
            onClose={() => setAssetsOpen(false)}
          />
        </AssetDialog>
      )}
    </aside>
  );
}

function AssetDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="studio-asset-dialog"
      aria-label="Reference library"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function StudioStage({
  surface,
  model,
  history,
  view,
  pending,
  onOpen,
  onError,
  onResume,
  onCancel,
}: {
  surface: Surface;
  model: ModelEntry;
  history: RunRecord[];
  view: GalleryView;
  pending: number;
  onOpen: (id: string) => void;
  onError: (message: string | null) => void;
  onResume: (record: RunRecord) => Promise<void>;
  onCancel: (record: RunRecord) => Promise<void>;
}) {
  const latest = history.find(
    (r) => r.surface === surface && r.status === "completed" && r.urls.length,
  );
  const jobs = history.filter(
    (r) =>
      r.status === "running" ||
      (r.status === "interrupted" && r.phase !== "submitting"),
  );
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [busyJobs, setBusyJobs] = useState<Set<string>>(new Set());
  const library = view === "assets" || view === "favorites";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPlaying(false);
  }, [latest?.id]);
  async function jobAction(
    job: RunRecord,
    action: (record: RunRecord) => Promise<void>,
  ) {
    setBusyJobs((prev) => new Set(prev).add(job.id));
    try {
      await action(job);
    } finally {
      setBusyJobs((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  }
  async function download() {
    if (!latest) return;
    setDownloadBusy(true);
    try {
      if (!(await saveFile(latest.urls[0]!, fileNameFor(latest, 0))))
        onError(
          "Could not download this file. Inspect the creation and open the original media to save it.",
        );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloadBusy(false);
    }
  }
  return (
    <>
      <div className="studio-workspace-heading">
        <div>
          <span className="studio-eyebrow">
            {library ? "YOUR CREATIVE ARCHIVE" : "FROM IDEA TO FRAME"}
          </span>
          <h2>
            {library
              ? view === "favorites"
                ? "The keepers."
                : "Made by you."
              : surface === "video"
                ? "Your next scene."
                : "Your next image."}
          </h2>
        </div>
        <span className="studio-workspace-label">
          {library ? `${history.length} creations` : "STUDIO / 01"}
        </span>
      </div>
      {!library && latest && (
        <section className="studio-stage" aria-label="Preview">
          <div className="studio-stage-top">
            <span>{latest ? "LATEST CREATION" : "THE VIEWFINDER"}</span>
            <span>
              {latest ? latest.modelLabel : "A SPACE FOR YOUR NEXT IDEA"}
            </span>
          </div>
          <div className={`studio-viewfinder ${latest ? "has-media" : ""}`}>
            {latest ? (
              <>
                {latest.kind === "video" ? (
                  <video
                    ref={videoRef}
                    key={latest.urls[0]}
                    src={latest.urls[0]}
                    controls
                    playsInline
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() =>
                      onError(
                        "This output is no longer available. Higgsfield retains files for at least seven days; download creations you want to keep.",
                      )
                    }
                  />
                ) : (
                  <img src={latest.urls[0]} alt={latest.prompt} />
                )}
              </>
            ) : (
              <>
                <div className="studio-landscape" aria-hidden>
                  <span className="studio-sun" />
                  <span className="studio-ridge studio-ridge-back" />
                  <span className="studio-ridge studio-ridge-middle" />
                  <span className="studio-ridge studio-ridge-front" />
                  <span className="studio-landscape-noise" />
                </div>
                <span className="studio-frame-corner corner-tl" />
                <span className="studio-frame-corner corner-tr" />
                <span className="studio-frame-corner corner-bl" />
                <span className="studio-frame-corner corner-br" />
                <div className="studio-viewfinder-copy">
                  <span className="studio-eyebrow">THE WORLD YOU IMAGINE</span>
                  <h3>
                    Every great film
                    <br />
                    starts with <em>a feeling.</em>
                  </h3>
                  <p>Describe yours. We’ll help you find the frame.</p>
                </div>
                <span className="studio-preview-note">
                  ILLUSTRATIVE STUDIO CANVAS
                </span>
              </>
            )}
          </div>
          <div className="studio-stage-bottom">
            <div>
              <span className="studio-stage-indicator" aria-hidden />
              <span>
                {latest ? latest.meta : `${model.label} / Ready when you are`}
              </span>
            </div>
            <div>
              {latest && (
                <>
                  <button
                    type="button"
                    aria-label="Inspect latest creation"
                    onClick={() => onOpen(latest.id)}
                  >
                    Inspect
                  </button>
                  {latest.kind === "video" && (
                    <button
                      type="button"
                      aria-label={playing ? "Pause preview" : "Play preview"}
                      onClick={() => {
                        if (playing) videoRef.current?.pause();
                        else
                          void videoRef.current
                            ?.play()
                            .catch(() =>
                              onError("Could not play the preview."),
                            );
                      }}
                    >
                      <PlayBadgeIcon size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Download latest creation"
                    disabled={downloadBusy}
                    onClick={() => void download()}
                  >
                    {downloadBusy ? "Saving…" : <DownloadIcon size={15} />}
                  </button>
                </>
              )}
              <span className="studio-timecode">
                {latest?.badge ?? "00:00:00"}
              </span>
            </div>
          </div>
        </section>
      )}
      {!library && !latest && (
        <section className="studio-presets" aria-label="Scene starters">
          <div className="studio-section-heading">
            <h3>Start with a scene</h3>
          </div>
          <div className="studio-preset-grid">
            {(surface === "video" ? PRESETS : IMAGE_PRESETS).map(
              (preset, i) => (
                <button
                  key={preset.name}
                  type="button"
                  className={`studio-preset preset-${preset.color}`}
                  onClick={() => {
                    useActive
                      .getState()
                      .setModel(surface === "video" ? "cinema-4" : "soul-2");
                    (surface === "video" ? useVideoPrompt : useImagePrompt)
                      .getState()
                      .setText(preset.scene);
                    useSettings.getState().set(
                      surface === "video" ? "cinema-4" : "soul-2",
                      surface === "video"
                        ? {
                            ...preset.settings,
                            duration: 5,
                            resolution: "720p",
                            aspectRatio: "16:9",
                          }
                        : {},
                    );
                    onError(null);
                    document.getElementById("studio-prompt")?.focus();
                  }}
                >
                  <span className="studio-preset-number">0{i + 1}</span>
                  <span className="studio-preset-shape" aria-hidden />
                  <span className="studio-preset-name">
                    {preset.name}
                    <small>{preset.kind}</small>
                  </span>
                  <span className="studio-preset-arrow" aria-hidden>
                    ↗
                  </span>
                </button>
              ),
            )}
          </div>
        </section>
      )}
      {(jobs.length > 0 || pending > 0) && (
        <section className="studio-jobs" aria-label="Generation queue">
          <div className="studio-section-heading">
            <h3>In the making</h3>
            <span className="studio-small">{jobs.length + pending} jobs</span>
          </div>
          {pending > 0 && (
            <p className="studio-small" role="status">
              Submitting {pending} {pending === 1 ? "request" : "requests"}…
            </p>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="studio-job">
              <span
                className={`studio-job-mark ${job.status === "running" ? "is-running" : ""}`}
                aria-hidden
              />
              <div>
                <strong>{job.modelLabel}</strong>
                <p>
                  {job.status === "interrupted"
                    ? job.submission
                      ? "Submission interrupted. Your scene is saved."
                      : "Tracking paused. Your request is saved."
                    : job.phase === "in_progress"
                      ? "Generating your shot…"
                      : "Queued for generation"}
                </p>
              </div>
              {job.status === "interrupted" && (
                <button
                  type="button"
                  disabled={busyJobs.has(job.id)}
                  onClick={() => void jobAction(job, onResume)}
                >
                  {busyJobs.has(job.id)
                    ? "Checking…"
                    : job.submission
                      ? "Resume submission"
                      : "Resume tracking"}
                </button>
              )}
              {job.status === "running" && job.phase !== "in_progress" && (
                <button
                  type="button"
                  disabled={busyJobs.has(job.id)}
                  onClick={() => void jobAction(job, onCancel)}
                >
                  {busyJobs.has(job.id) ? "Canceling…" : "Cancel queued job"}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <div className="studio-results-heading">
        <h3>
          {view === "favorites" ? "Favorite creations" : "Your creations"}
        </h3>
        <span className="studio-small">
          {
            history.filter((r) =>
              view === "favorites"
                ? r.favorite
                : view === "assets" || r.surface === surface,
            ).length
          }{" "}
          results · stored in this browser
        </span>
      </div>
    </>
  );
}
