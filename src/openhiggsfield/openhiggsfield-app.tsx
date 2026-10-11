"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BRAND_MARK } from "@/brand";

import { hasPlatformCredentials } from "@/generation/actions";
import {
  submitGeneration,
  cancelGeneration,
  GenerationRequestError,
} from "@/generation/client";
import { MissingCredentialsError } from "@/generation/credentials";
import { MODELS, getModel } from "@/generation/catalog";
import type { Surface } from "@/generation/catalog";
import { assemblePlane } from "@/generation/plane";
import { validatePlane } from "@/generation/validate";
import type { GenerationStatus } from "@/generation/platform";
import {
  POLL_DEADLINE_MS,
  stopWatching,
  watchRequest,
} from "@/generation/poll";
import { useActive } from "@/generation/stores/active";
import { useImagePrompt, useVideoPrompt } from "@/generation/stores/prompt";
import { useSettings } from "@/generation/stores/settings";
import { useImageMedia, useVideoMedia } from "@/generation/stores/media";
import { generateFilm } from "@/film/generate";
import { useStoryboard } from "@/generation/stores/storyboard";
import { FilmProjects } from "./film-projects";
import { FilmWorkbench } from "./film-workbench";

import { GRAIN_URI, artFor } from "./artwork";
import {
  StudioComposer as Composer,
  StudioHeader as Topbar,
  StudioStage,
} from "./studio";
import { fileNameFor, saveFile } from "./download";
import { KeyModal } from "./key-modal";
import {
  CROSS_VIEWS,
  countSetting,
  durationBadge,
  metaOf,
  ratioToCss,
  type GalleryView,
} from "./data";
import { Gallery } from "./gallery";
import {
  loadHistory,
  mergeHistory,
  replaceRequest,
  saveHistory,
  stepRun,
  type RunRecord,
} from "./history";
import { CloseIcon, UndoIcon } from "./icons";
import { SelectionBar, type SaveProgress } from "./selection-bar";
import { Viewer } from "./viewer";

/* Long enough to read the bar and reach it; the drain line states the window. */
const UNDO_MS = 6000;

export interface ActiveRun {
  /** Identifies the skeleton this run occupies, so a batch clears one tile at
      a time as its own request settles. */
  id: string;
  surface: Surface;
  modelLabel: string;
  ratio: string;
  startedAt: number;
}

type RunDraft = {
  surface: Surface;
  modelId: string;
  modelLabel: string;
  prompt: string;
  ratio: string;
  meta: string;
  badge?: string;
  settings?: Record<string, unknown>;
  media?: import("@/generation/catalog").GenerationPlane["media"];
  statusUrl?: string;
  createdAt: number;
};

function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

function rowId(requestId: string, offset: number, count: number): string {
  return count > 1 ? `${requestId}#${offset}` : requestId;
}

function draftOf(record: RunRecord): RunDraft {
  return {
    surface: record.surface,
    modelId: record.modelId,
    modelLabel: record.modelLabel,
    prompt: record.prompt,
    ratio: record.ratio,
    meta: record.meta,
    badge: record.badge,
    settings: record.settings,
    media: record.media,
    statusUrl: record.statusUrl,
    createdAt: record.createdAt,
  };
}

function runningRows(
  requestId: string,
  count: number,
  draft: RunDraft,
): RunRecord[] {
  return Array.from({ length: count }, (_, offset) => {
    const id = rowId(requestId, offset, count);
    return {
      id,
      requestId,
      surface: draft.surface,
      modelId: draft.modelId,
      modelLabel: draft.modelLabel,
      prompt: draft.prompt,
      ratio: draft.ratio,
      meta: draft.meta,
      badge: draft.badge,
      kind: draft.surface,
      urls: [],
      status: "running",
      art: artFor(draft.surface, hueOf(id), id),
      createdAt: draft.createdAt,
      settings: draft.settings,
      media: draft.media,
      statusUrl: draft.statusUrl,
      phase: "queued",
    };
  });
}

function terminalRows(
  requestId: string,
  draft: RunDraft,
  status: GenerationStatus,
): RunRecord[] {
  const urls =
    status.images?.map((image) => image.url) ??
    (status.video ? [status.video.url] : []);
  const completed = status.status === "completed" && urls.length > 0;
  const base = status.requestId || requestId;
  const failure = completed ? undefined : failureText(status);
  const delivered: Array<string | null> = completed ? urls : [null];
  return delivered.map((url, offset) => {
    const id = rowId(base, offset, delivered.length);
    return {
      id,
      requestId: base,
      surface: draft.surface,
      modelId: draft.modelId,
      modelLabel: draft.modelLabel,
      prompt: draft.prompt,
      ratio: draft.ratio,
      meta: draft.meta,
      badge: draft.badge,
      kind: draft.surface,
      urls: url ? [url] : [],
      status: completed ? "completed" : "failed",
      error: failure,
      art: artFor(draft.surface, hueOf(id), id),
      createdAt: draft.createdAt,
      settings: draft.settings,
      media: draft.media,
      statusUrl: draft.statusUrl,
    };
  });
}

function failedRows(
  requestId: string,
  count: number,
  draft: RunDraft,
  error: string,
): RunRecord[] {
  return runningRows(requestId, count, draft).map((row) => ({
    ...row,
    status: "failed" as const,
    error,
  }));
}

function failureText(status: GenerationStatus): string {
  if (status.status === "nsfw") return "Filtered by safety moderation";
  if (status.status === "canceled") return "Canceled";
  if (typeof status.error === "string" && status.error) return status.error;
  return "Generation failed";
}

function describeError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);
  if (
    caught instanceof MissingCredentialsError ||
    message.includes("Missing platform key")
  ) {
    return "Add your platform key to generate.";
  }
  return message;
}

export function OpenHiggsfieldApp({
  fontClassName = "",
  initialKeyConfigured = false,
}: {
  fontClassName?: string;
  initialKeyConfigured?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const surface = useActive((state) => state.surface);
  const modelId = useActive((state) => state.model);
  const setModel = useActive((state) => state.setModel);
  const model = getModel(modelId);
  const setSettings = useSettings((state) => state.set);

  const [history, setHistory] = useState<RunRecord[]>([]);
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [view, setView] = useState<GalleryView>(surface);
  const [focusNonce, setFocusNonce] = useState(0);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  /* Deleting drops the only copy of a run — the platform's result URLs are not
     re-derivable — so the records are held aside until the bar times out. */
  const [deleted, setDeleted] = useState<RunRecord[] | null>(null);
  /* Picked runs, in the order they were picked: the count stack shows the most
     recent sheets on top, and a range extends from the last one touched. */
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState<SaveProgress | null>(null);
  const [keyConfigured, setKeyConfigured] = useState(initialKeyConfigured);
  const [keysOpen, setKeysOpen] = useState(false);
  const [workspace, setWorkspace] = useState<"studio" | "films">("studio");
  const [filmOpen, setFilmOpen] = useState(false);
  const [advancedShot, setAdvancedShot] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "video" | "image">(
    "all",
  );
  const projectId = useStoryboard((s) => s.activeProjectId);
  const projectBusy = useStoryboard((s) => s.generating || s.editingBusy);
  const navigateWorkspace = useCallback(
    (next: "studio" | "films", id?: string) => {
      const board = useStoryboard.getState();
      if (board.generating || board.editingBusy) {
        setError("Wait for the current operation before changing workspaces.");
        return;
      }
      if (id && board.activeProjectId !== id) board.openProject(id);
      setWorkspace(next);
      setFilmOpen(!!id);
      setAdvancedShot(null);
      setError(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("workspace");
      url.searchParams.delete("project");
      if (next === "films") {
        url.searchParams.set("workspace", "films");
        if (id) url.searchParams.set("project", id);
      }
      window.history.pushState(null, "", url);
    },
    [],
  );
  useEffect(() => {
    const sync = () => {
      const url = new URL(window.location.href),
        board = useStoryboard.getState();
      if (board.generating || board.editingBusy) {
        setError("Finish the current operation before navigating.");
        return;
      }
      const next =
        url.searchParams.get("workspace") === "films" ? "films" : "studio";
      const id = url.searchParams.get("project");
      setWorkspace(next);
      setAdvancedShot(null);
      try {
        if (id && next === "films") {
          if (board.activeProjectId !== id) board.openProject(id);
          setFilmOpen(true);
        } else setFilmOpen(false);
      } catch (error) {
        setFilmOpen(false);
        setError((error as Error).message);
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    if (!advancedShot) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>(
      ".film-direction-drawer",
    );
    const handle = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        setAdvancedShot(null);
      }
      if (event.key !== "Tab" || !dialog) return;
      const nodes = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.querySelector<HTMLElement>("textarea")?.focus();
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [advancedShot]);

  const galleryRef = useRef<HTMLDivElement>(null);
  const rangeAnchor = useRef<number | null>(null);
  const visibleRef = useRef<RunRecord[]>([]);
  /* Presses number their own skeletons, so two batches in flight together can
     never claim the same tile. */
  const press = useRef(0);
  const submitting = useRef(false);
  const recovering = useRef(new Set<string>());
  const alive = useRef(true);
  const freshTimers = useRef<number[]>([]);
  const historyRef = useRef(history);
  historyRef.current = history;

  /* The model picker can cross surfaces, so the scope follows it — unless the
     visitor parked on a scope that spans both. */
  useEffect(() => {
    setView((current) => (CROSS_VIEWS.has(current) ? current : surface));
  }, [surface]);

  /* Read once on mount. A load that finishes after unmount must not mark the
     next mount hydrated, or the empty initial list is written over the store. */
  useEffect(() => {
    let live = true;
    void loadHistory()
      .then((rows) => {
        if (!live) return;
        const recovered = rows.map((row) =>
          row.submission && row.phase === "submitting"
            ? {
                ...row,
                phase: "submission_error",
                error:
                  "Submission was interrupted. Resume with the saved identifier to check or finish this request.",
              }
            : row,
        );
        setHistory((current) => mergeHistory(recovered, current));
        setHistoryLoaded(true);
      })
      .catch(() => {
        if (live) setHistoryLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (historyLoaded) void saveHistory(history);
  }, [historyLoaded, history]);

  useEffect(() => {
    let live = true;
    void hasPlatformCredentials()
      .then((ready) => {
        if (!live) return;
        setKeyConfigured(ready);
      })
      .catch(() => {
        if (live)
          setError(
            "Could not check your connection. Open connection settings to add a key.",
          );
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopWatching();
      for (const timer of freshTimers.current) clearTimeout(timer);
    };
  }, []);

  /* Each arrival blooms on its own clock: a batch lands over several seconds,
     and one shared timer would cut the last tile's entrance short. */
  const markFresh = useCallback((ids: string[]) => {
    setFreshIds((prev) => [...prev, ...ids]);
    freshTimers.current.push(
      window.setTimeout(
        () => setFreshIds((prev) => prev.filter((id) => !ids.includes(id))),
        900,
      ),
    );
  }, []);

  /* One watch per platform request, used both by Generate and by a reload that
     found running rows already in the log. */
  const resume = useCallback(
    async (requestId: string, draft: RunDraft, expected: number) => {
      try {
        const status = await watchRequest(requestId, {
          deadline: Date.now() + POLL_DEADLINE_MS,
          statusUrl: draft.statusUrl,
          onProgress: (phase) => {
            if (alive.current)
              setHistory((prev) =>
                prev.map((row) =>
                  row.requestId === requestId && row.phase !== phase
                    ? { ...row, phase }
                    : row,
                ),
              );
          },
        });
        if (!alive.current) return;
        const records = terminalRows(requestId, draft, status);
        setHistory((prev) => {
          const next = replaceRequest(prev, requestId, records);
          return next;
        });
        markFresh(
          records
            .filter((record) => record.status === "completed")
            .map((record) => record.id),
        );
        if (records.some((record) => record.status === "failed")) {
          const failure =
            records[0]?.error ?? "the platform reported a failure";
          setError(
            (prev) =>
              prev ??
              `Run not delivered — ${failure}. Adjust the prompt or settings and retry.`,
          );
        }
      } catch (caught) {
        if (
          !alive.current ||
          (caught instanceof Error && caught.message === "Watching stopped")
        )
          return;
        const message = describeError(caught);
        if (message.includes("platform key")) setKeysOpen(true);
        setHistory((prev) => {
          const next = replaceRequest(
            prev,
            requestId,
            failedRows(requestId, expected, draft, message).map((row) => ({
              ...row,
              status: "interrupted" as const,
            })),
          );
          return next;
        });
        setError((prev) => prev ?? message);
      }
    },
    [markFresh],
  );

  /* After the log hydrates, pick up any request that was still on the platform
     when the last session died. Generate starts its own watch; this is the
     refresh path. */
  useEffect(() => {
    if (!historyLoaded) return;
    const groups = new Map<string, RunRecord[]>();
    for (const record of historyRef.current) {
      if (record.status !== "running" || !record.requestId || record.filmShotId)
        continue;
      const rows = groups.get(record.requestId) ?? [];
      rows.push(record);
      groups.set(record.requestId, rows);
    }
    for (const [requestId, rows] of groups) {
      void resume(requestId, draftOf(rows[0]!), rows.length);
    }
  }, [historyLoaded, resume]);

  const recordFilmRun = useCallback((record: RunRecord, intentId: string) => {
    setHistory((prev) => {
      const previous = prev.find((r) => r.id === record.id);
      return [
        { ...record, ...(previous?.favorite ? { favorite: true } : {}) },
        ...prev.filter(
          (r) =>
            r.id !== record.id &&
            r.id !== intentId &&
            r.submission?.idempotencyKey !== intentId,
        ),
      ];
    });
  }, []);
  useEffect(() => {
    if (!historyLoaded || (workspace === "films" && filmOpen)) return;
    const state = useStoryboard.getState();
    if (state.generating || state.editingBusy) return;
    const accepted = state.shots.filter(
      (shot) =>
        shot.job?.requestId &&
        !["failed", "interrupted"].includes(shot.job.phase),
    );
    if (accepted.length)
      void generateFilm(
        accepted.map((s) => s.id),
        recordFilmRun,
      ).catch((error) => {
        if (!(error instanceof Error && error.message === "Watching stopped"))
          setError(describeError(error));
      });
  }, [
    historyLoaded,
    workspace,
    filmOpen,
    projectBusy,
    projectId,
    recordFilmRun,
  ]);

  const visible = useMemo(() => {
    return history.filter(
      (record) =>
        (view === "assets" ||
          (view === "favorites" && record.favorite) ||
          record.surface === view) &&
        (mediaFilter === "all" || record.kind === mediaFilter) &&
        `${record.prompt} ${record.modelLabel}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  }, [history, view, mediaFilter, search]);

  const switchView = useCallback(
    (next: GalleryView) => {
      navigateWorkspace("studio");
      setView(next);
      setSearch("");
      setMediaFilter("all");
      galleryRef.current?.scrollTo({ top: 0 });
      if (CROSS_VIEWS.has(next) || next === surface) return;
      const first = MODELS.find((entry) => entry.surface === next);
      if (first) setModel(first.id);
    },
    [setModel, surface, navigateWorkspace],
  );

  /* Presses do not wait on each other. A press snapshots its own plane, opens
     its own skeletons and keeps its own watch, so the composer is free the
     moment the tiles appear and any number of runs can be in flight. */
  const generate = useCallback(async () => {
    if (submitting.current) return;
    if (!keyConfigured) {
      setKeysOpen(true);
      setError("Add your platform key to generate.");
      return;
    }
    let plane: import("@/generation/catalog").GenerationPlane;
    try {
      plane = validatePlane(assemblePlane());
    } catch (caught) {
      setError(describeError(caught));
      return;
    }
    submitting.current = true;

    const entry = getModel(plane.model);
    const ratio = ratioToCss(
      plane.settings.aspectRatio,
      entry.surface === "image" ? "4 / 3" : "16 / 9",
    );
    const meta = metaOf(entry, plane.settings);
    const badge =
      entry.surface === "video" ? durationBadge(plane.settings) : undefined;

    /* Batch size resolves to results, not to requests. A model that carries its
       own count answers one request with that many media; every other model is
       submitted once per result. Either way the grid opens the same number of
       skeletons, and each request clears the ones it owns. */
    const native = countSetting(entry);
    const expected = native
      ? Math.max(1, Number(plane.settings[native.key]) || 1)
      : useActive.getState().batch;
    const startedAt = Date.now();
    const seq = ++press.current;
    const pending: ActiveRun[] = Array.from(
      { length: expected },
      (_, index) => ({
        id: `pending-${seq}-${index}`,
        surface: entry.surface,
        modelLabel: entry.label,
        ratio,
        startedAt,
      }),
    );
    const slots = native
      ? [{ skeletons: pending.map((slot) => slot.id) }]
      : pending.map((slot) => ({ skeletons: [slot.id] }));
    const draft: RunDraft = {
      surface: entry.surface,
      modelId: entry.id,
      modelLabel: entry.label,
      prompt: plane.prompt.text.trim(),
      ratio,
      meta,
      badge,
      settings: plane.settings,
      media: plane.media,
      createdAt: startedAt,
    };

    setError(null);
    /* Newest press on top, above whatever is still rendering from the last. */
    setRuns((prev) => [...pending, ...prev]);
    galleryRef.current?.scrollTo({ top: 0, behavior: "smooth" });

    const runOne = async (slot: { skeletons: string[] }) => {
      const idempotencyKey = crypto.randomUUID();
      const temporary = failedRows(
        idempotencyKey,
        slot.skeletons.length,
        draft,
        "Submission is being sent",
      ).map((row) => ({
        ...row,
        status: "interrupted" as const,
        requestId: undefined,
        phase: "submitting",
        submission: { plane, idempotencyKey },
      }));
      setHistory((prev) => [...temporary, ...prev]);
      try {
        const queued = await submitGeneration(plane, idempotencyKey);
        const acceptedDraft = { ...draft, statusUrl: queued.statusUrl };
        setHistory((prev) => {
          const next = [
            ...runningRows(
              queued.requestId,
              slot.skeletons.length,
              acceptedDraft,
            ),
            ...prev.filter(
              (row) => row.submission?.idempotencyKey !== idempotencyKey,
            ),
          ];
          return next;
        });
        setRuns((prev) =>
          prev.filter((active) => !slot.skeletons.includes(active.id)),
        );
        void resume(queued.requestId, acceptedDraft, slot.skeletons.length);
      } catch (caught) {
        if (!alive.current) return;
        const message = describeError(caught);
        const uncertain =
          !(caught instanceof GenerationRequestError) || caught.status >= 500;
        setHistory((prev) =>
          prev.map((row) =>
            row.submission?.idempotencyKey === idempotencyKey
              ? {
                  ...row,
                  status: uncertain ? "interrupted" : "failed",
                  phase: "submission_error",
                  error: uncertain
                    ? `${message}. Resume this submission with its saved identifier to avoid a duplicate.`
                    : message,
                }
              : row,
          ),
        );
        if (message.includes("platform key")) setKeysOpen(true);
        setError((prev) => prev ?? message);
      } finally {
        if (alive.current) {
          setRuns((prev) =>
            prev.filter((active) => !slot.skeletons.includes(active.id)),
          );
        }
      }
    };

    try {
      await Promise.all(slots.map(runOne));
    } finally {
      submitting.current = false;
    }
  }, [keyConfigured, resume]);

  const recover = useCallback(
    async (record: RunRecord) => {
      if (record.filmShotId) {
        try {
          const project = useStoryboard
            .getState()
            .projects.find((p) =>
              p.shots.some((s) => s.id === record.filmShotId),
            );
          if (project) navigateWorkspace("films", project.id);
          await generateFilm([record.filmShotId], recordFilmRun);
        } catch (error) {
          setError(describeError(error));
        }
        return;
      }
      const identity =
        record.submission?.idempotencyKey ?? record.requestId ?? record.id;
      if (recovering.current.has(identity)) return;
      recovering.current.add(identity);
      try {
        setError(null);
        if (record.submission) {
          const { plane, idempotencyKey } = record.submission;
          try {
            const queued = await submitGeneration(plane, idempotencyKey);
            const draft = { ...draftOf(record), statusUrl: queued.statusUrl };
            const expected =
              historyRef.current.filter(
                (r) => r.submission?.idempotencyKey === idempotencyKey,
              ).length || 1;
            setHistory((prev) => [
              ...runningRows(queued.requestId, expected, draft),
              ...prev.filter(
                (r) => r.submission?.idempotencyKey !== idempotencyKey,
              ),
            ]);
            void resume(queued.requestId, draft, expected);
          } catch (error) {
            setError(describeError(error));
          }
          return;
        }
        if (!record.requestId) return;
        setHistory((prev) =>
          prev.map((row) =>
            row.requestId === record.requestId
              ? { ...row, status: "running", error: undefined }
              : row,
          ),
        );
        void resume(
          record.requestId,
          draftOf(record),
          historyRef.current.filter((r) => r.requestId === record.requestId)
            .length,
        );
      } finally {
        recovering.current.delete(identity);
      }
    },
    [resume, recordFilmRun, navigateWorkspace],
  );

  const cancel = useCallback(async (record: RunRecord) => {
    if (!record.requestId) return;
    try {
      await cancelGeneration(record.requestId);
    } catch (error) {
      setError(describeError(error));
    }
  }, []);

  /* Reuse restores the whole plane the run was made from — model, its dials,
     then the words. A reuse that dropped the ratio and resolution would
     re-render a different picture from the same prompt. */
  const retry = useCallback(
    (record: RunRecord) => {
      navigateWorkspace("studio");
      setView(record.surface);
      if (MODELS.some((entry) => entry.id === record.modelId)) {
        setModel(record.modelId);
        if (record.settings) setSettings(record.modelId, record.settings);
      }
      (record.surface === "image" ? useImagePrompt : useVideoPrompt)
        .getState()
        .setText(record.prompt);
      (record.surface === "image" ? useImageMedia : useVideoMedia)
        .getState()
        .replace(Object.values(record.media ?? {}).flat());
      setViewerId(null);
      setError(null);
      setFocusNonce((n) => n + 1);
    },
    [setModel, setSettings, navigateWorkspace],
  );

  const toggleFavorite = useCallback((record: RunRecord) => {
    setHistory((prev) =>
      prev.map((entry) =>
        entry.id === record.id
          ? { ...entry, favorite: !entry.favorite }
          : entry,
      ),
    );
  }, []);

  const deleteRuns = useCallback((records: RunRecord[]) => {
    if (records.length === 0) return;
    const ids = new Set(records.map((record) => record.id));
    setHistory((prev) => prev.filter((entry) => !ids.has(entry.id)));
    setDeleted(records);
  }, []);

  const deleteRun = useCallback(
    (record: RunRecord) => deleteRuns([record]),
    [deleteRuns],
  );

  /* History is newest-first by construction, so the restored runs drop back
     into their own places rather than onto the top of the grid. */
  const restoreDeleted = useCallback(() => {
    if (!deleted) return;
    setHistory((prev) => {
      const here = new Set(prev.map((entry) => entry.id));
      const back = deleted.filter((entry) => !here.has(entry.id));
      if (back.length === 0) return prev;
      return [...prev, ...back].sort((a, b) => b.createdAt - a.createdAt);
    });
    setDeleted(null);
  }, [deleted]);

  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), UNDO_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDeleted(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [deleted]);

  /* ---------- picking runs ----------

     The grid is in selection mode whenever something is picked, so the mode has
     no switch of its own: the checkbox that appears on hover is the way in, and
     the toolbar's cross is the way out. */

  const pickedSet = useMemo(() => new Set(selected), [selected]);
  const byId = useMemo(
    () => new Map(history.map((record) => [record.id, record])),
    [history],
  );
  const pickedRecords = useMemo(
    () =>
      selected
        .map((id) => byId.get(id))
        .filter((record) => record !== undefined),
    [selected, byId],
  );

  /* The range gesture walks the scope the visitor is looking at, and the walk
     happens inside the handler — reading it from a dependency would rebuild the
     callback on every history change and re-render all forty tiles with it. */
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  /* A run that left the grid cannot stay picked — deleted, aged out of the cap,
     or released from the shelf while the Favorites scope was the one on screen.
     The toolbar counts what the visitor can still see it acting on. */
  const visibleIds = useMemo(
    () => new Set(visible.map((record) => record.id)),
    [visible],
  );
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((id) => visibleIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [visibleIds]);

  /* Switching scope switches what "everything picked" means, so the selection
     does not travel with it. */
  useEffect(() => {
    setSelected([]);
    rangeAnchor.current = null;
  }, [view]);

  const clearPicked = useCallback(() => {
    setSelected([]);
    rangeAnchor.current = null;
  }, []);

  const togglePick = useCallback(
    (id: string, index: number, range: boolean) => {
      const from = rangeAnchor.current;
      rangeAnchor.current = index;
      setSelected((prev) => {
        if (range && from !== null) {
          const span = visibleRef.current
            .slice(Math.min(from, index), Math.max(from, index) + 1)
            .filter((record) => record.status !== "running")
            .map((record) => record.id);
          const held = new Set(prev);
          return [...prev, ...span.filter((entry) => !held.has(entry))];
        }
        return prev.includes(id)
          ? prev.filter((entry) => entry !== id)
          : [...prev, id];
      });
    },
    [],
  );

  /* Escape leaves the selection the way it leaves every other transient layer
     in the studio. The viewer owns the key while it is open. */
  useEffect(() => {
    if (selected.length === 0 || viewerId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearPicked();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected.length, viewerId, clearPicked]);

  /* One keep for the whole selection: if every picked run is already kept the
     press releases them, which is what a pressed control has to mean. */
  const favoritePicked = useCallback(() => {
    const ids = new Set(selected);
    const keep = !pickedRecords.every((record) => record.favorite === true);
    setHistory((prev) =>
      prev.map((entry) =>
        ids.has(entry.id) ? { ...entry, favorite: keep } : entry,
      ),
    );
  }, [selected, pickedRecords]);

  const deletePicked = useCallback(() => {
    deleteRuns(pickedRecords);
    clearPicked();
  }, [deleteRuns, pickedRecords, clearPicked]);

  /* One run, saved from its card. The refusal is reported through the strip the
     composer already reserves for it — a 32px button on a picture has no room
     to explain itself, and the viewer's own Download states what to do next. */
  const downloadRun = useCallback(async (record: RunRecord) => {
    const url = record.urls[0];
    if (!url) return;
    const ok = await saveFile(url, fileNameFor(record, 0));
    if (!ok) {
      setError(
        "The platform’s CDN refused the read, so this run could not be saved. Open it to save it from the browser instead.",
      );
    }
  }, []);

  /* Saved one at a time on purpose: browsers throttle a burst of downloads into
     a single "allow multiple files?" prompt and drop the rest, and a sequence is
     the only version that can report how far it got. */
  const downloadPicked = useCallback(async () => {
    const files = pickedRecords.filter((record) => record.urls[0]);
    if (files.length === 0) return;
    setSaving({ done: 0, total: files.length });
    let refused = 0;
    for (const [index, record] of files.entries()) {
      const ok = await saveFile(record.urls[0]!, fileNameFor(record, index));
      if (!ok) refused++;
      setSaving({ done: index + 1, total: files.length });
    }
    setSaving(null);
    if (refused > 0) {
      setError(
        refused === files.length
          ? "The platform’s CDN refused the read, so nothing could be saved. Open a run to save it from the browser instead."
          : `${refused} of ${files.length} files could not be saved — the platform’s CDN refused the read. Open those runs to save them from the browser.`,
      );
    }
  }, [pickedRecords]);

  /* An empty-gallery starter loads the composer and hands the visitor the
     caret; pressing Generate stays their call. */
  const applyStarter = useCallback(
    (text: string) => {
      (surface === "image" ? useImagePrompt : useVideoPrompt)
        .getState()
        .setText(text);
      setError(null);
      setFocusNonce((n) => n + 1);
    },
    [surface],
  );

  const openViewer = useCallback((id: string) => setViewerId(id), []);
  const openKeys = useCallback(() => setKeysOpen(true), []);
  const runGenerate = useCallback(() => generate(), [generate]);
  const downloadSelection = useCallback(
    () => void downloadPicked(),
    [downloadPicked],
  );
  const dismissDeleted = useCallback(() => setDeleted(null), []);
  const viewerItem = viewerId
    ? (history.find(
        (record) => record.id === viewerId && record.status !== "running",
      ) ?? null)
    : null;

  /* The walk follows the scope on screen, not the whole log: arrowing out of
     the viewer never lands on a run the grid behind it is not showing. At
     either end there is no neighbour to hand down, and the step goes quiet. */
  const viewable = useMemo(
    () => visible.filter((record) => record.status !== "running"),
    [visible],
  );
  const prevRun = viewerId ? stepRun(viewable, viewerId, -1) : null;
  const nextRun = viewerId ? stepRun(viewable, viewerId, 1) : null;

  const runsHere = useMemo(
    () => runs.filter((active) => view === "assets" || active.surface === view),
    [runs, view],
  );
  const busy =
    runs.length > 0 || history.some((record) => record.status === "running");

  // Saved browser state is unavailable to the server. Mount it after hydration
  // so restored prompts, models and project controls match their rendered state.
  if (!mounted)
    return (
      <div className={`ohf ${fontClassName} experience-loading`} role="status">
        <img src={BRAND_MARK} width="38" height="38" alt="" />
        <span>Opening your workspace…</span>
      </div>
    );

  return (
    <div
      className={`ohf ${fontClassName}`}
      style={{ "--ohf-grain": GRAIN_URI } as React.CSSProperties}
    >
      <div className="ohf-shell">
        <main className="ohf-main">
          <Topbar
            view={view}
            onView={switchView}
            busy={busy}
            keyConfigured={keyConfigured}
            onKeys={openKeys}
            workspace={workspace}
            onFilms={() => navigateWorkspace("films")}
            navigationDisabled={projectBusy}
          />
          {workspace === "films" ? (
            <div className="film-workspace-shell">
              {filmOpen && projectId ? (
                <FilmWorkbench
                  key={projectId}
                  surface="video"
                  history={history}
                  onRecord={recordFilmRun}
                  onError={setError}
                  onBack={() => navigateWorkspace("films")}
                  onEditShot={setAdvancedShot}
                />
              ) : (
                <FilmProjects
                  onOpen={(id) => navigateWorkspace("films", id)}
                  onError={setError}
                />
              )}
              {error && !filmOpen && (
                <p className="workspace-error" role="alert">
                  {error}
                  <button
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </p>
              )}
              {advancedShot && (
                <div className="film-direction-overlay">
                  <button
                    className="film-direction-scrim"
                    aria-label="Close shot direction"
                    onClick={() => setAdvancedShot(null)}
                  />
                  <div
                    className="film-direction-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Advanced shot direction"
                  >
                    <div className="direction-drawer-heading">
                      <h2>Shot direction</h2>
                      <button
                        onClick={() => setAdvancedShot(null)}
                        aria-label="Close shot direction"
                      >
                        ×
                      </button>
                    </div>
                    <Composer
                      surface={surface}
                      model={model}
                      generating={projectBusy}
                      error={error}
                      focusNonce={1}
                      history={history}
                      selecting={false}
                      selection={null}
                      onError={setError}
                      onGenerate={runGenerate}
                      filmShotId={advancedShot}
                      onApplied={() => setAdvancedShot(null)}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`studio-layout ${CROSS_VIEWS.has(view) ? "studio-library-layout" : ""}`}
            >
              <section
                className="studio-workspace"
                aria-label="Creative workspace"
              >
                <StudioStage
                  surface={surface}
                  model={model}
                  history={history}
                  view={view}
                  pending={runs.length}
                  onOpen={openViewer}
                  onError={setError}
                  onResume={recover}
                  onCancel={cancel}
                />
                {CROSS_VIEWS.has(view) && (
                  <div className="library-toolbar">
                    <input
                      aria-label="Search creations"
                      placeholder="Search prompts or models…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                      aria-label="Library media filter"
                      value={mediaFilter}
                      onChange={(e) =>
                        setMediaFilter(e.target.value as typeof mediaFilter)
                      }
                    >
                      <option value="all">All media</option>
                      <option value="video">Videos</option>
                      <option value="image">Images</option>
                    </select>
                    <span>{visible.length} results</span>
                  </div>
                )}
                <Gallery
                  view={view}
                  surface={surface}
                  items={visible.filter(
                    (record) => record.phase !== "submitting",
                  )}
                  runs={runsHere}
                  freshIds={freshIds}
                  picked={pickedSet}
                  onOpen={openViewer}
                  onPick={togglePick}
                  onReuse={retry}
                  onFavorite={toggleFavorite}
                  onDownload={downloadRun}
                  onDelete={deleteRun}
                  onStarter={applyStarter}
                  galleryRef={galleryRef}
                />
              </section>

              {!CROSS_VIEWS.has(view) && (
                <Composer
                  surface={surface}
                  model={model}
                  generating={busy}
                  error={error}
                  focusNonce={focusNonce}
                  history={history}
                  selecting={selected.length > 0}
                  selection={
                    <SelectionBar
                      records={pickedRecords}
                      saving={saving}
                      onDownload={downloadSelection}
                      onFavorite={favoritePicked}
                      onDelete={deletePicked}
                      onClose={clearPicked}
                    />
                  }
                  onError={setError}
                  onGenerate={runGenerate}
                  onSaveToFilm={() => {
                    const id = useStoryboard.getState().activeProjectId;
                    if (id) navigateWorkspace("films", id);
                  }}
                  notice={
                    deleted && (
                      <UndoBar
                        records={deleted}
                        onUndo={restoreDeleted}
                        onDismiss={dismissDeleted}
                      />
                    )
                  }
                />
              )}
              {CROSS_VIEWS.has(view) && error && (
                <p className="workspace-error" role="alert">
                  {error}
                  <button
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </p>
              )}
              {CROSS_VIEWS.has(view) && deleted && (
                <UndoBar
                  records={deleted}
                  onUndo={restoreDeleted}
                  onDismiss={dismissDeleted}
                />
              )}
            </div>
          )}
        </main>

        {viewerItem && (
          <Viewer
            item={viewerItem}
            onPrev={prevRun ? () => setViewerId(prevRun.id) : undefined}
            onNext={nextRun ? () => setViewerId(nextRun.id) : undefined}
            onClose={() => setViewerId(null)}
            onReuse={() => retry(viewerItem)}
            onFavorite={() => toggleFavorite(viewerItem)}
            /* The viewer is released along with the run, so undoing the
               delete restores it to the grid and not back over the studio. */
            onDelete={() => {
              setViewerId(null);
              deleteRun(viewerItem);
            }}
          />
        )}
        {keysOpen && (
          <KeyModal
            configured={keyConfigured}
            onClose={() => setKeysOpen(false)}
            onSaved={() => {
              setKeyConfigured(true);
              setKeysOpen(false);
              setError(null);
            }}
            onCleared={() => {
              void hasPlatformCredentials().then(setKeyConfigured);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* Deletion's receipt, in the strip the composer already reserves for the
   generation error — the studio gains no second floating layer. The hairline
   drains across the bar so the window to change your mind is visible, not
   guessed at. */
function UndoBar({
  records,
  onUndo,
  onDismiss,
}: {
  records: RunRecord[];
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const one = records.length === 1 ? records[0] : null;
  /* The words name the run to the person who wrote them; the model does not —
     a grid made on one model reads back as the same label over and over. Runs
     submitted without a prompt keep the model as their only name. The verb
     leads so a long prompt loses its tail to the ellipsis, not the sentence. */
  const subject = one
    ? one.prompt
      ? `“${one.prompt}”`
      : `${one.modelLabel} run`
    : `${records.length} runs`;

  return (
    <div className="ohf-undo" role="status">
      <span
        className="ohf-undo-drain"
        style={{ animationDuration: `${UNDO_MS}ms` }}
        aria-hidden
      />
      <span className="ohf-undo-text">{`Deleted ${subject}`}</span>
      <button type="button" className="ohf-undo-act" onClick={onUndo}>
        <UndoIcon />
        Undo
      </button>
      <button
        type="button"
        className="ohf-icon-btn ohf-icon-btn--ghost"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
