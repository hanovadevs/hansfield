import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane, MediaRole } from "./catalog/types";
import { modelForInput } from "./catalog/input-mode";

export function validatePlane(data: unknown): GenerationPlane {
  if (!data || typeof data !== "object")
    throw new Error("Invalid generation request");
  const input = data as GenerationPlane;
  const model = getModel(input.model);
  if (typeof input.prompt?.text !== "string" || !input.prompt.text.trim())
    throw new Error("Describe your shot before generating.");
  if (input.prompt.text.length > 10000)
    throw new Error("Keep your prompt under 10,000 characters.");
  if (
    !input.media ||
    typeof input.media !== "object" ||
    Array.isArray(input.media)
  )
    throw new Error("Invalid reference media");
  if (
    !input.settings ||
    typeof input.settings !== "object" ||
    Array.isArray(input.settings)
  )
    throw new Error("Invalid model settings");
  const media: GenerationPlane["media"] = {};
  for (const [role, items] of Object.entries(input.media)) {
    const limit = model.roles[role as MediaRole];
    if (
      !Array.isArray(items) ||
      (items.length && !limit) ||
      items.length > (limit ?? 0)
    )
      throw new Error(`Unsupported ${role} attachments for ${model.label}`);
    for (const item of items) {
      if (!item || item.role !== role || typeof item.id !== "string")
        throw new Error("Invalid reference media");
      let url: URL;
      try {
        url = new URL(item.url);
      } catch {
        throw new Error("References need a public HTTPS URL.");
      }
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.)/.test(
          url.hostname,
        )
      )
        throw new Error("References need a public HTTPS URL.");
    }
    media[role as MediaRole] = items;
  }
  for (const role of model.requiredRoles ?? []) {
    if (!media[role]?.length)
      throw new Error(
        `Add a ${role === "start" ? "start frame" : role === "reference" ? "reference image" : role} for ${model.label}.`,
      );
  }
  if (media.end?.length && !media.start?.length)
    throw new Error("Add a start frame before an end frame.");
  if (
    media.start?.length &&
    (media.reference?.length || media.video?.length || media.audio?.length) &&
    model.id.startsWith("seedance")
  )
    throw new Error(
      "Use start/end frames or references for Seedance, in separate runs.",
    );
  return {
    model: model.id,
    prompt: { text: input.prompt.text.trim() },
    media,
    settings: parseSettings(modelForInput(model, media), input.settings),
  };
}
