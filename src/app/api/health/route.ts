import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { ledgerDatabase } from "@/server/usage-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let cached: { at: number; ready: boolean } | undefined;

export async function GET() {
  if (!cached || Date.now() - cached.at > 60000) {
    let ready =
      process.env.NODE_ENV !== "production" ||
      /^[a-f0-9]{64}$/i.test(process.env.SESSION_ENCRYPTION_KEY || "");
    try {
      ledgerDatabase().prepare("SELECT 1").get();
      const run = promisify(execFile);
      await Promise.all([
        run(process.env.FFMPEG_PATH || ffmpeg!, ["-version"], {
          timeout: 5000,
          windowsHide: true,
        }),
        run(process.env.FFPROBE_PATH || ffprobe.path, ["-version"], {
          timeout: 5000,
          windowsHide: true,
        }),
        access(tmpdir(), constants.W_OK),
      ]);
    } catch {
      ready = false;
    }
    cached = { at: Date.now(), ready };
  }
  return Response.json(
    { status: cached.ready ? "ready" : "unavailable", product: "Jenera" },
    {
      status: cached.ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
