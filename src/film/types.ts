import type { GenerationPlane } from "@/generation/catalog";

export type ContinuityMode = "none" | "frame" | "video";
export type Clip = {
  url: string;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
};
export type ShotJob = {
  phase:
    | "preparing"
    | "submitting"
    | "queued"
    | "in_progress"
    | "interrupted"
    | "failed";
  idempotencyKey: string;
  plane?: GenerationPlane;
  requestId?: string;
  statusUrl?: string;
  startedAt: number;
  sourceSignature?: string;
  inputSignature?: string;
  error?: string;
};
export type FilmShot = {
  id: string;
  title: string;
  plane: GenerationPlane;
  continuity?: ContinuityMode;
  clip?: Clip;
  trimStart?: number;
  trimEnd?: number;
  muted?: boolean;
  sourceSignature?: string;
  inputSignature?: string;
  clipRevision?: string;
  job?: ShotJob;
};
export type Cut = { url: string; start: number; end: number; muted?: boolean };

export function cutOf(shot: FilmShot): Cut | undefined {
  if (!shot.clip) return;
  const start = shot.trimStart ?? 0;
  const end = shot.trimEnd ?? shot.clip.duration;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end > shot.clip.duration + 0.02 ||
    end - start < 0.1
  )
    throw new Error(
      "Keep at least 0.1 seconds and choose cuts inside the clip.",
    );
  return {
    url: shot.clip.url,
    start,
    end: Math.min(end, shot.clip.duration),
    muted: shot.muted,
  };
}
export function signatureOf(
  shot: FilmShot,
  mode: "frame" | "video" = "video",
): string {
  const cut = cutOf(shot);
  return cut
    ? JSON.stringify([
        cut.url,
        mode === "video" ? cut.start : null,
        cut.end,
        shot.clipRevision ?? "",
      ])
    : "";
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function inputSignatureOf(shot: FilmShot, notes: string): string {
  return JSON.stringify(
    canonical({
      model: shot.plane.model,
      prompt: shot.plane.prompt.text.trim(),
      settings: shot.plane.settings,
      media: Object.fromEntries(
        Object.entries(shot.plane.media).map(([role, items]) => [
          role,
          items?.map((item) => item.url),
        ]),
      ),
      continuity: shot.continuity ?? "none",
      notes: notes.trim(),
    }),
  );
}
export function isStale(
  shot: FilmShot,
  previous?: FilmShot,
  notes = "",
): boolean {
  if (!shot.clip) return false;
  if (
    shot.inputSignature &&
    shot.inputSignature !== inputSignatureOf(shot, notes)
  )
    return true;
  return (
    !!shot.continuity &&
    shot.continuity !== "none" &&
    shot.sourceSignature !==
      (previous ? signatureOf(previous, shot.continuity) : "")
  );
}
export function shotsNeedingGeneration(
  shots: FilmShot[],
  notes: string,
): FilmShot[] {
  const needed: FilmShot[] = [];
  let previousChanged = false;
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]!;
    const changed: boolean =
      !shot.clip ||
      isStale(shot, shots[i - 1], notes) ||
      (previousChanged && !!shot.continuity && shot.continuity !== "none");
    if (changed) needed.push(shot);
    previousChanged = changed;
  }
  return needed;
}
