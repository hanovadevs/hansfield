import {
  getModel,
  resolveSettings,
  type GenerationPlane,
} from "@/generation/catalog";
import { modelForInput } from "@/generation/catalog/input-mode";
import type { FilmShot, ContinuityMode } from "./types";

export function durationFor(modelId: string, desired: number): number {
  const field = modelForInput(getModel(modelId), {}).settings.duration;
  if (!field) throw new Error("Choose a video model with a duration control.");
  if (field.type === "enum") {
    const allowed = field.values.map(Number).filter(Number.isFinite);
    return allowed.reduce((best, value) =>
      Math.abs(value - desired) < Math.abs(best - desired) ? value : best,
    );
  }
  if (field.type !== "range") throw new Error("Unsupported duration control.");
  return Math.min(
    field.max,
    Math.max(
      field.min,
      Math.round(desired / (field.step ?? 1)) * (field.step ?? 1),
    ),
  );
}

export function planShots(
  story: string,
  modelId: string,
  target: number,
  seconds: number,
  continuity: ContinuityMode,
): FilmShot[] {
  const model = getModel(modelId);
  if (model.surface !== "video" || model.requiredRoles?.length)
    throw new Error("Choose a text-to-video model to plan a film.");
  const beats = story
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!beats.length || story.length > 20000)
    throw new Error("Write your story (up to 20,000 characters).");
  if (
    !Number.isFinite(target) ||
    target < 4 ||
    target > 600 ||
    !Number.isFinite(seconds) ||
    seconds < 1
  )
    throw new Error("Choose a target between 4 seconds and 10 minutes.");
  if (continuity === "frame" && !model.roles.start)
    throw new Error(
      "This model cannot use a last frame as its opening frame. Choose Seedance, Kling, Wan, or LTX.",
    );
  if (continuity === "video" && !model.roles.video)
    throw new Error("This model does not accept video references.");
  const duration = durationFor(modelId, seconds);
  const count = Math.max(beats.length, Math.ceil(target / duration));
  if (count > 40)
    throw new Error(
      "A film can have up to 40 shots. Increase the shot duration.",
    );
  return Array.from({ length: count }, (_, index) => {
    const beat =
      beats[
        Math.min(beats.length - 1, Math.floor((index * beats.length) / count))
      ]!;
    const phase =
      index === 0
        ? "Establish the scene and begin the action."
        : index === count - 1
          ? "Bring the ongoing action to a natural ending."
          : "Progress the action naturally from the preceding moment; do not replay the opening.";
    return {
      id: crypto.randomUUID(),
      title: `Shot ${index + 1}`,
      continuity: index === 0 ? "none" : continuity,
      plane: {
        model: modelId,
        prompt: { text: `${beat}\n${phase}` },
        media: {},
        settings: {
          ...resolveSettings(modelForInput(model, {}), {}),
          duration,
        },
      },
    };
  });
}

export function continuityPlane(
  shot: FilmShot,
  notes: string,
  previous?: FilmShot,
  referenceUrl?: string,
): GenerationPlane {
  const model = getModel(shot.plane.model);
  const media = structuredClone(shot.plane.media);
  const mode = shot.continuity ?? "none";
  if (mode !== "none") {
    if (!previous?.clip || !referenceUrl)
      throw new Error("Finish the previous shot before continuing it.");
    if (mode === "frame") {
      if (!model.roles.start)
        throw new Error(
          "Choose a model with a start frame input for frame continuity.",
        );
      // A new opening frame supersedes the old frame and mixed reference modes.
      delete media.start;
      delete media.end;
      delete media.reference;
      delete media.video;
      delete media.audio;
      media.start = [
        { id: crypto.randomUUID(), role: "start", url: referenceUrl },
      ];
    } else {
      if (!model.roles.video)
        throw new Error("Choose a model with video reference input.");
      delete media.start;
      delete media.end;
      media.video = [
        { id: crypto.randomUUID(), role: "video", url: referenceUrl },
      ];
    }
  }
  const text = [
    notes.trim() ? `Continuity notes: ${notes.trim()}` : "",
    mode === "frame"
      ? "Start exactly from the supplied opening frame. Preserve the character identity, wardrobe, setting, lighting, screen direction, and camera position. Continue the action forward without a reset or scene cut."
      : "",
    mode === "video"
      ? "The supplied video is the preceding clip. Continue from its ending as a new standalone shot. Preserve character identity, wardrobe, environment, lighting, motion direction and camera style; do not replay the previous footage."
      : "",
    shot.plane.prompt.text,
  ]
    .filter(Boolean)
    .join("\n\n");
  if (text.length > 10000)
    throw new Error(
      "Shorten the shot prompt or continuity notes to stay under 10,000 characters.",
    );
  return {
    ...structuredClone(shot.plane),
    prompt: { text },
    media,
    settings: resolveSettings(modelForInput(model, media), shot.plane.settings),
  };
}
