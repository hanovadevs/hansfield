import { cinema4, genjutsu } from "./cinema";
import { grokImagine2 } from "./grok-imagine-2";
import { grokImagineVideo15 } from "./grok-imagine-video-1.5";
import { happyHorse1 } from "./happy-horse-1";
import { happyHorse11 } from "./happy-horse-1.1";
import { ideogram4 } from "./ideogram-4";
import { kling25 } from "./kling-2.5";
import { kling26 } from "./kling-2.6";
import {
  kling34k,
  kling3MotionPro,
  kling3MotionStd,
  kling3Pro,
  kling3Std,
  kling3Turbo,
} from "./kling-3";
import { klingO1 } from "./kling-o1";
import { klingO3 } from "./kling-o3";
import { ltx25Fast } from "./ltx-2.5-fast";
import { ltx25Pro } from "./ltx-2.5-pro";
import { minimaxH3 } from "./minimax-h3";
import { minimaxHailuo23 } from "./minimax-hailuo-2.3";
import { parseSettings, resolveSettings } from "./parse-settings";
import { pixverse6 } from "./pixverse-6";
import { qwenImage3 } from "./qwen-image-3";
import { recraft41 } from "./recraft-4.1";
import { seedance2 } from "./seedance-2";
import { seedance25, seedance25Edit, seedance25Extend } from "./seedance-2.5";
import { soul2, soulCinema } from "./soul";
import type { ModelEntry } from "./types";
import { wan26 } from "./wan-2.6";
import { wan27 } from "./wan-2.7";
import { wan3 } from "./wan-3";
import { wan3Prime } from "./wan-3-prime";
import { zImageTurbo } from "./z-image-turbo";

export const MODELS: readonly ModelEntry[] = [
  cinema4,
  genjutsu,
  soul2,
  soulCinema,
  seedance25,
  seedance25Edit,
  seedance25Extend,
  seedance2,
  kling3Turbo,
  kling3Std,
  kling3Pro,
  kling34k,
  kling3MotionStd,
  kling3MotionPro,
  grokImagine2,
  ideogram4,
  recraft41,
  qwenImage3,
  zImageTurbo,
  wan3,
  wan3Prime,
  wan27,
  wan26,
  minimaxH3,
  minimaxHailuo23,
  happyHorse1,
  happyHorse11,
  kling26,
  kling25,
  klingO3,
  klingO1,
  ltx25Fast,
  ltx25Pro,
  grokImagineVideo15,
  pixverse6,
];

export function getModel(id: string): ModelEntry {
  const model = MODELS.find((entry) => entry.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
}

export type {
  GenerationPlane,
  MediaItem,
  MediaRole,
  ModelEntry,
  PlatformPaths,
  Surface,
} from "./types";
export { parseSettings, resolveSettings };
