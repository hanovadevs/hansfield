"use client";

import { resolveSettings, type ModelEntry } from "@/generation/catalog";
import { ModelSettingField } from "./model-setting-field";

const BASIC_KEYS = [
  "duration",
  "resolution",
  "aspectRatio",
  "outputFormat",
  "generateAudio",
  "sound",
];

export function FilmShotSettings({
  model,
  values: raw,
  disabled,
  onChange,
}: {
  model: ModelEntry;
  values: Record<string, unknown>;
  disabled: boolean;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const values = resolveSettings(model, raw);
  const basicKeys = BASIC_KEYS.filter((key) => model.settings[key]);
  const directionKeys = Object.keys(model.settings).filter(
    (key) => !BASIC_KEYS.includes(key),
  );
  function field(key: string) {
    return (
      <ModelSettingField
        key={key}
        model={model}
        settingKey={key}
        values={values}
        variant="film"
        onChange={(patch) =>
          onChange(resolveSettings(model, { ...values, ...patch }))
        }
      />
    );
  }
  return (
    <fieldset className="film-shot-settings" disabled={disabled}>
      <legend>Video settings</legend>
      <div className="film-settings-row">{basicKeys.map(field)}</div>
      {directionKeys.length > 0 && (
        <div className="film-shot-direction">
          <h4>
            {model.id === "cinema-4" ? "Camera & style" : "More controls"}
          </h4>
          <div className="film-settings-row">{directionKeys.map(field)}</div>
        </div>
      )}
    </fieldset>
  );
}
