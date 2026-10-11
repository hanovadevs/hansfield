import type { ModelEntry } from "./types";

export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    if (field.type === "enum") {
      const picked = typeof value === "string" ? value : field.default;
      if (field.optional && picked === "") continue;
      if (!field.values.includes(picked)) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    if (field.type === "range") {
      const picked = typeof value === "number" ? value : field.default;
      const step = field.step ?? 1;
      if (
        !Number.isFinite(picked) ||
        picked < field.min ||
        picked > field.max ||
        Math.abs(
          (picked - field.min) / step - Math.round((picked - field.min) / step),
        ) > 0.000001
      ) {
        throw new Error(`Invalid ${key}`);
      }
      out[key] = picked;
      continue;
    }
    out[key] = typeof value === "boolean" ? value : field.default;
  }
  return out;
}

/** Recover obsolete persisted values independently when model schemas change. */
export function resolveSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    let value = raw[key];
    if (
      field.type === "enum" &&
      typeof value === "number" &&
      field.values.includes(String(value))
    )
      value = String(value);
    try {
      safe[key] = parseSettings(
        { ...model, settings: { [key]: field } },
        { [key]: value },
      )[key];
    } catch {
      safe[key] = field.default;
    }
  }
  return parseSettings(model, safe);
}
