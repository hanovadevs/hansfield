import snapshot from "./api-schemas.json";
import type {
  MediaRole,
  ModelEntry,
  PlatformPaths,
  SettingField,
} from "./types";

export type ApiProperty = {
  type?: string;
  enum?: (string | number)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
};
export type ApiSchema = {
  properties: Record<string, ApiProperty>;
  required?: string[];
  additionalProperties?: boolean;
  then?: { required?: string[] };
};
const endpoints = snapshot.endpoints as Record<
  string,
  { source: string; schema: ApiSchema }
>;
export const toSnakeCase = (key: string) =>
  key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamelCase = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export function schemaFor(path: string) {
  return endpoints[path]?.schema;
}
export function sourceFor(path: string) {
  return endpoints[path]?.source;
}

export function documentedSettings(
  path: string,
  fallback: ModelEntry["settings"],
): ModelEntry["settings"] {
  const schema = schemaFor(path);
  if (!schema) return fallback;
  const settings: Record<string, SettingField> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    // Conditional custom-shot modes need structured prompts. Keep the native
    // toggle hidden until those inputs can be supplied; Films handles sequences.
    if (
      key === "multi_shots" &&
      schema.then?.required?.includes("multi_prompt")
    )
      continue;
    if (
      [
        "prompt",
        "seed",
        "style_id",
        "custom_reference_strength",
        "style_strength",
      ].includes(key) ||
      key.endsWith("_url") ||
      key.endsWith("_urls")
    )
      continue;
    const id = toCamelCase(key);
    if (prop.enum?.length)
      settings[id] = {
        type: "enum",
        values: prop.enum.map(String),
        default: prop.default !== undefined ? String(prop.default) : "",
        optional: prop.default === undefined,
      };
    else if (
      (prop.type === "integer" || prop.type === "number") &&
      typeof prop.default === "number" &&
      typeof prop.minimum === "number" &&
      typeof prop.maximum === "number"
    )
      settings[id] = {
        type: "range",
        min: prop.minimum,
        max: prop.maximum,
        default: prop.default,
        step:
          prop.multipleOf ??
          (prop.type === "integer" ? 1 : key === "duration" ? 1 : 0.01),
      };
    else if (prop.type === "boolean")
      settings[id] = { type: "boolean", default: prop.default === true };
  }
  return settings;
}

export function documentedRoles(
  paths: PlatformPaths,
  fallback: ModelEntry["roles"],
): ModelEntry["roles"] {
  const roles: Partial<Record<MediaRole, number>> = {};
  const roleKeys: Record<string, MediaRole> = {
    image_url: "start",
    first_frame_url: "start",
    end_image_url: "end",
    last_image_url: "end",
    last_frame_url: "end",
    image_urls: "reference",
    video_url: "video",
    video_urls: "video",
    audio_url: "audio",
    audio_urls: "audio",
  };
  let documented = false;
  for (const path of Object.values(paths)) {
    if (!path) continue;
    const schema = schemaFor(path);
    if (!schema) continue;
    documented = true;
    for (const [key, prop] of Object.entries(schema.properties)) {
      const role = roleKeys[key];
      if (role)
        roles[role] = Math.max(
          roles[role] ?? 0,
          prop.type === "array" ? (prop.maxItems ?? fallback[role] ?? 8) : 1,
        );
    }
  }
  return documented ? roles : fallback;
}

export function documentedRequiredRoles(paths: PlatformPaths): MediaRole[] {
  const path = paths.text ?? paths.firstLast ?? paths.reference ?? paths.image;
  const keys: Record<string, MediaRole> = {
    image_url: "start",
    first_frame_url: "start",
    last_frame_url: "end",
    image_urls: "reference",
    video_url: "video",
    video_urls: "video",
    audio_url: "audio",
    audio_urls: "audio",
  };
  return (path ? (schemaFor(path)?.required ?? []) : []).flatMap((key) =>
    keys[key] ? [keys[key]!] : [],
  );
}

export function normalizeInput(
  path: string,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const schema = schemaFor(path);
  if (!schema)
    throw new Error(
      "This endpoint is not in the verified Higgsfield catalog. Choose a documented model.",
    );
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const prop = schema.properties[key];
    if (!prop || value === undefined || value === "") continue;
    const resolved =
      (prop.type === "integer" || prop.type === "number") &&
      typeof value === "string"
        ? Number(value)
        : value;
    if (prop.enum && !prop.enum.includes(resolved as string | number))
      throw new Error(`Unsupported ${key} for this model and input mode.`);
    if (prop.type === "integer" && !Number.isInteger(resolved))
      throw new Error(`${key} must be a whole number.`);
    if (
      (prop.type === "number" || prop.type === "integer") &&
      (typeof resolved !== "number" ||
        !Number.isFinite(resolved) ||
        (prop.minimum !== undefined && resolved < prop.minimum) ||
        (prop.maximum !== undefined && resolved > prop.maximum))
    )
      throw new Error(`Invalid ${key} for this model.`);
    if (
      typeof resolved === "string" &&
      prop.maxLength !== undefined &&
      resolved.length > prop.maxLength
    )
      throw new Error(`${key} is too long for this model.`);
    if (
      Array.isArray(resolved) &&
      ((prop.maxItems !== undefined && resolved.length > prop.maxItems) ||
        (prop.minItems !== undefined && resolved.length < prop.minItems))
    )
      throw new Error(`Invalid number of ${key}.`);
    out[key] = resolved;
  }
  for (const required of schema.required ?? [])
    if (
      out[required] === undefined ||
      out[required] === "" ||
      (Array.isArray(out[required]) && !out[required].length)
    )
      throw new Error(`This model requires ${required.replace(/_/g, " ")}.`);
  return out;
}
