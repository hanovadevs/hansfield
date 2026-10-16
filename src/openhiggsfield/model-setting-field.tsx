"use client";

import type { ModelEntry } from "@/generation/catalog";
import { settingLabel } from "./data";

/** One schema-backed control, shared by Studio and individual film shots. */
export function ModelSettingField({
  model,
  settingKey,
  values,
  onChange,
  variant = "studio",
}: {
  model: ModelEntry;
  settingKey: string;
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  variant?: "studio" | "film";
}) {
  const field = model.settings[settingKey];
  if (!field) return null;
  const film = variant === "film";
  const label =
    film && settingKey === "duration"
      ? "Duration (s)"
      : settingLabel(settingKey);
  const ariaLabel = film ? `Shot ${label.toLowerCase()}` : label;
  const value = values[settingKey] ?? field.default;
  if (field.type === "boolean")
    return (
      <label className={film ? "film-setting-toggle" : "studio-toggle"}>
        <span>{label}</span>
        <input
          type="checkbox"
          aria-label={ariaLabel}
          checked={value === true}
          onChange={(e) => onChange({ [settingKey]: e.target.checked })}
        />
      </label>
    );
  return (
    <label className={film ? "film-label" : "studio-field"}>
      <span>{label}</span>
      {field.type === "enum" ? (
        <select
          aria-label={ariaLabel}
          value={String(value)}
          onChange={(e) => onChange({ [settingKey]: e.target.value })}
        >
          {field.optional && !field.values.includes("") && (
            <option value="">Director decides</option>
          )}
          {field.values.map((option) => (
            <option key={option} value={option}>
              {option === ""
                ? "Director decides"
                : option
                    .replace(/-/g, " ")
                    .replace(/^f14 /, "f/1.4 ")
                    .replace(/^f4 /, "f/4 ")
                    .replace(/^f11 /, "f/11 ")}
            </option>
          ))}
        </select>
      ) : film ? (
        <input
          type="number"
          aria-label={ariaLabel}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(value)}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            const step = field.step ?? 1;
            if (
              Number.isFinite(next) &&
              next >= field.min &&
              next <= field.max &&
              Math.abs(
                (next - field.min) / step -
                  Math.round((next - field.min) / step),
              ) < 0.000001
            )
              onChange({ [settingKey]: next });
          }}
        />
      ) : (
        <div className="studio-range">
          <input
            aria-label={ariaLabel}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value)}
            onChange={(e) => onChange({ [settingKey]: Number(e.target.value) })}
          />
          <output>
            {String(value)}
            {settingKey === "duration" ? "s" : ""}
          </output>
        </div>
      )}
    </label>
  );
}
