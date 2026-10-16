import { getModel } from "@/generation/catalog";
import { SpendReviewCanceledError } from "@/generation/spend-review";
import { useStoryboard } from "@/generation/stores/storyboard";
import { submitGeneration, GenerationRequestError } from "@/generation/client";
import { watchRequest } from "@/generation/poll";
import { validatePlane } from "@/generation/validate";
import { toPlatform } from "@/generation/to-platform";
import { artFor } from "@/openhiggsfield/artwork";
import { metaOf, ratioToCss } from "@/openhiggsfield/data";
import type { RunRecord } from "@/openhiggsfield/history";
import { continuityPlane } from "./plan";
import {
  cutOf,
  signatureOf,
  inputSignatureOf,
  type ShotJob,
  type FilmShot,
} from "./types";
import { inspectClip, mediaRequest, uploadReference } from "./client";

export type RecordFilmRun = (record: RunRecord, intentId: string) => void;
function recordFor(
  shot: FilmShot,
  job: ShotJob,
  status: RunRecord["status"],
  urls: string[] = [],
  error?: string,
): RunRecord {
  const plane = job.plane ?? shot.plane;
  const model = getModel(plane.model);
  return {
    id: job.requestId ?? job.idempotencyKey,
    requestId: job.requestId,
    statusUrl: job.statusUrl,
    status,
    phase: job.phase,
    surface: "video",
    kind: "video",
    modelId: model.id,
    modelLabel: model.label,
    prompt: plane.prompt.text,
    settings: plane.settings,
    media: plane.media,
    ratio: ratioToCss(plane.settings.aspectRatio, "16 / 9"),
    meta: metaOf(model, plane.settings),
    art: artFor("video", 38, plane.prompt.text),
    createdAt: job.startedAt,
    urls,
    error,
    filmShotId: shot.id,
    ...(!job.requestId && job.plane
      ? { submission: { plane: job.plane, idempotencyKey: job.idempotencyKey } }
      : {}),
  };
}

async function referenceFor(
  previous: FilmShot,
  mode: "frame" | "video",
): Promise<string> {
  const cut = cutOf(previous)!;
  if (mode === "frame") {
    const response = await mediaRequest({
      mode: "frame",
      clips: [cut],
      time: cut.end,
    });
    return uploadReference(
      await response.blob(),
      "previous-shot-final-frame.jpg",
    );
  }
  // Keep the actual selected ending, and stay within common video-reference length limits.
  if (cut.start === 0 && cut.end === previous.clip!.duration && cut.end <= 10)
    return cut.url;
  const response = await mediaRequest({
    mode: "trim",
    clips: [{ ...cut, start: Math.max(cut.start, cut.end - 10) }],
  });
  return uploadReference(await response.blob(), "previous-shot-ending.mp4");
}

export async function generateFilmShot(
  id: string,
  onRecord: RecordFilmRun,
): Promise<void> {
  const state = useStoryboard.getState();
  const index = state.shots.findIndex((shot) => shot.id === id);
  const shot = state.shots[index];
  if (!shot) throw new Error("Shot not found.");
  if (getModel(shot.plane.model).surface !== "video")
    throw new Error(
      "Image shots cannot be rendered as video. Choose a video model.",
    );
  let job: ShotJob =
    shot.job && shot.job.phase !== "failed"
      ? structuredClone(shot.job)
      : {
          phase: "preparing",
          idempotencyKey: crypto.randomUUID(),
          startedAt: Date.now(),
          inputSignature: inputSignatureOf(shot, state.notes),
        };
  useStoryboard.getState().patch(id, { job });
  const publish = (record: RunRecord) => onRecord(record, job.idempotencyKey);
  let completedUrl: string | undefined;
  try {
    if (!job.requestId) {
      if (!job.plane) {
        const previous = state.shots[index - 1];
        const mode = shot.continuity ?? "none";
        let reference: string | undefined;
        if (mode !== "none") {
          const model = getModel(shot.plane.model);
          if (!(mode === "frame" ? model.roles.start : model.roles.video))
            throw new Error(
              "Choose a model that supports this continuity input.",
            );
          if (!previous?.clip)
            throw new Error(
              "Finish the previous shot before generating this continuation.",
            );
          try {
            reference = await referenceFor(previous, mode);
          } catch (error) {
            const reason =
              error instanceof Error
                ? error.message
                : "Reference preparation failed.";
            throw new Error(
              `Could not prepare shot ${index}'s ${mode === "frame" ? "final frame" : "video reference"}. ${reason} The next shot was not submitted.`,
            );
          }
          job.sourceSignature = signatureOf(previous, mode);
        }
        job.plane = validatePlane(
          continuityPlane(shot, state.notes, previous, reference),
        );
        toPlatform(job.plane);
      }
      job.phase = "submitting";
      useStoryboard.getState().patch(id, { job: { ...job } });
      const queued = await submitGeneration(job.plane, job.idempotencyKey);
      // Replace the local intent row with the accepted provider row in the gallery.
      job = {
        ...job,
        phase: "queued",
        requestId: queued.requestId,
        statusUrl: queued.statusUrl,
      };
      useStoryboard.getState().patch(id, { job });
    }
    publish(recordFor(shot, job, "running"));
    const status = await watchRequest(job.requestId!, {
      statusUrl: job.statusUrl,
      onProgress: (phase) => {
        if (phase !== "queued" && phase !== "in_progress") return;
        job = { ...job, phase };
        useStoryboard.getState().patch(id, { job });
        publish(recordFor(shot, job, "running"));
      },
    });
    if (status.status !== "completed" || !status.video?.url) {
      const reason =
        typeof status.error === "string"
          ? status.error
          : `Higgsfield returned ${status.status}.`;
      job = { ...job, phase: "failed", error: reason };
      useStoryboard.getState().patch(id, { job });
      publish(recordFor(shot, job, "failed", [], reason));
      throw new Error(reason);
    }
    completedUrl = status.video.url;
    publish(recordFor(shot, job, "completed", [completedUrl]));
    const clip = await inspectClip(status.video.url);
    useStoryboard.getState().patch(id, {
      clip,
      trimStart: 0,
      trimEnd: clip.duration,
      sourceSignature: job.sourceSignature,
      inputSignature: job.inputSignature,
      clipRevision: job.requestId,
      job: undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate this shot.";
    // Component cleanup stops polling, not the accepted provider request.
    // Keep it queued so the next mount can resume it automatically.
    if (message === "Watching stopped") throw error;
    if (error instanceof SpendReviewCanceledError) {
      useStoryboard.getState().patch(id, { job: undefined });
      throw error;
    }
    if (job.phase !== "failed") {
      const rejected =
        !job.plane ||
        (error instanceof GenerationRequestError && error.status < 500);
      job = {
        ...job,
        phase: rejected ? "failed" : "interrupted",
        error: message,
      };
      useStoryboard.getState().patch(id, { job });
      if (job.plane)
        publish(
          recordFor(
            shot,
            job,
            completedUrl ? "completed" : rejected ? "failed" : "interrupted",
            completedUrl ? [completedUrl] : [],
            message,
          ),
        );
    }
    throw error;
  }
}

export async function generateFilm(
  ids: string[],
  onRecord: RecordFilmRun,
): Promise<void> {
  if (useStoryboard.getState().generating)
    throw new Error("A film generation is already running.");
  useStoryboard.getState().setGenerating(true);
  try {
    for (const id of ids) {
      if (useStoryboard.getState().stopRequested) break;
      await generateFilmShot(id, onRecord);
    }
  } finally {
    useStoryboard.getState().setGenerating(false);
  }
}
