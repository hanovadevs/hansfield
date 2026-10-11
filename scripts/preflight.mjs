import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

export async function preflight() {
  const mode = process.env.JENERA_APP_MODE || "byok";
  if (!["byok", "private"].includes(mode))
    throw new Error("JENERA_APP_MODE must be byok or private.");
  if (!/^[a-f0-9]{64}$/i.test(process.env.SESSION_ENCRYPTION_KEY || ""))
    throw new Error(
      "Set SESSION_ENCRYPTION_KEY to a random 32-byte hex secret before production startup.",
    );
  const origin = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  );
  if (mode === "byok" && origin.protocol !== "https:")
    throw new Error(
      "Set NEXT_PUBLIC_SITE_URL to the public HTTPS origin before production startup.",
    );
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an origin without a path, credentials, or query.",
    );
  if (process.env.HANSFIELD_TEST_MODE === "1")
    throw new Error("Disable HANSFIELD_TEST_MODE for production.");
  await access(process.env.FFMPEG_PATH || ffmpeg, constants.X_OK);
  await access(process.env.FFPROBE_PATH || ffprobe.path, constants.X_OK);
  await access(tmpdir(), constants.W_OK);
  if (
    mode === "byok" &&
    (process.env.HF_API_KEY || process.env.HF_CREDENTIALS || process.env.HF_KEY)
  )
    console.warn(
      "Jenera BYOK ignores the server's Higgsfield key. Remove unused shared credentials from the deployment.",
    );
  console.log(
    `Jenera preflight passed: ${mode}, native media tools, writable temporary storage.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  for (const file of [
    ".env.production.local",
    ".env.local",
    ".env.production",
    ".env",
  ]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await preflight();
}
