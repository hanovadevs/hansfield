import type { GenerationPlane, ModelEntry } from "./types";
import {
  documentedSettings,
  schemaFor,
  sourceFor,
  toSnakeCase,
} from "./schema";

export function endpointForInput(
  model: ModelEntry,
  media: GenerationPlane["media"],
): string | undefined {
  const start = !!media.start?.length;
  const reference = !!(
    media.reference?.length ||
    media.video?.length ||
    media.audio?.length
  );
  if (model.id === "cinema-4") return "higgsfield/cinema-studio/4.0";
  if (model.id === "genjutsu")
    return "higgsfield/genjutsu/motion-transfer/v1.0";
  if (model.id === "soul-2") return "higgsfield-ai/soul/v2/standard";
  if (model.id === "soul-cinema") return "higgsfield-ai/soul/cinema";
  if (model.id.startsWith("seedance-2")) {
    const prefix = model.id.startsWith("seedance-2.5")
      ? "bytedance/seedance-2.5"
      : "bytedance/seedance-2.0";
    if (model.id.endsWith("-edit")) return `${prefix}/video-edit`;
    if (model.id.endsWith("-extend")) return `${prefix}/video-extend`;
    return `${prefix}/${start ? "image-to-video" : reference ? "reference-to-video" : "text-to-video"}`;
  }
  if (model.id.startsWith("kling-3-motion"))
    return `kling-video/v3/motion-control/${model.id.endsWith("pro") ? "pro" : "std"}`;
  if (model.id === "kling-3-turbo")
    return `kling-video/v3.0-turbo/${start ? "image-to-video" : "text-to-video"}`;
  if (["kling-3-std", "kling-3-pro", "kling-3-4k"].includes(model.id))
    return `kling-video/v3.0/${model.id.slice(8)}/${start ? "image-to-video" : "text-to-video"}`;
  const paths = model.paths;
  if (!paths) return;
  if (paths.firstLast && (start || media.end?.length)) return paths.firstLast;
  if (paths.image && start) return paths.image;
  if (
    paths.reference &&
    (media.reference?.length ||
      media.video?.length ||
      (media.audio?.length &&
        schemaFor(paths.reference)?.properties.audio_urls))
  )
    return paths.reference;
  return paths.text ?? paths.image ?? paths.reference ?? paths.firstLast;
}

export function modelForInput(
  model: ModelEntry,
  media: GenerationPlane["media"],
): ModelEntry {
  const path = endpointForInput(model, media);
  const schema = path ? schemaFor(path) : undefined;
  if (!schema || !path) return model;
  const settings =
    model.paths || model.id === "cinema-4"
      ? documentedSettings(path, model.settings)
      : Object.fromEntries(
          Object.entries(model.settings).filter(
            ([key]) => !!schema.properties[toSnakeCase(key)],
          ),
        );
  return { ...model, settings };
}

export function modelReference(
  model: ModelEntry,
  media: GenerationPlane["media"],
): string | undefined {
  const path = endpointForInput(model, media);
  return path ? sourceFor(path) : undefined;
}
