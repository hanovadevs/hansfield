import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import type { Clip, Cut } from "./types";

const MAX_FILE = 100 * 1024 * 1024;
const MAX_TOTAL = 500 * 1024 * 1024;
const MAX_FILM_SECONDS = 600;
export type MediaOperation = {
  mode: "inspect" | "frame" | "trim" | "render";
  clips: Cut[];
  time?: number;
  format?: "landscape" | "portrait" | "square";
  resolution?: "720p" | "1080p";
  transition?: "cut" | "fade";
  muted?: boolean;
};

export function validateOperation(data: unknown): MediaOperation {
  if (!data || typeof data !== "object")
    throw new Error("Invalid film request.");
  const op = data as MediaOperation;
  if (
    !["inspect", "frame", "trim", "render"].includes(op.mode) ||
    !Array.isArray(op.clips) ||
    !op.clips.length ||
    op.clips.length > 40
  )
    throw new Error("Choose between 1 and 40 video clips.");
  if (op.mode !== "render" && op.clips.length !== 1)
    throw new Error("Choose one clip for this operation.");
  for (const clip of op.clips) {
    if (!clip || typeof clip.url !== "string" || clip.url.length > 8192)
      throw new Error("Invalid clip URL.");
    validateMediaUrl(clip.url);
    if (op.mode === "trim" || op.mode === "render") {
      if (
        !Number.isFinite(clip.start) ||
        !Number.isFinite(clip.end) ||
        clip.start < 0 ||
        clip.end - clip.start < 0.1 ||
        clip.end > 600
      )
        throw new Error(
          "Each cut must keep at least 0.1 seconds inside a clip.",
        );
    }
  }
  if (
    op.mode === "frame" &&
    (!Number.isFinite(op.time) || op.time! < 0 || op.time! > 600)
  )
    throw new Error("Choose a valid frame time.");
  if (
    op.format !== undefined &&
    !["landscape", "portrait", "square"].includes(op.format)
  )
    throw new Error("Invalid film format.");
  if (op.resolution !== undefined && !["720p", "1080p"].includes(op.resolution))
    throw new Error("Invalid export resolution.");
  if (op.transition !== undefined && !["cut", "fade"].includes(op.transition))
    throw new Error("Invalid transition.");
  if (
    (op.mode === "render" || op.mode === "trim") &&
    op.clips.reduce((n, c) => n + c.end - c.start, 0) > MAX_FILM_SECONDS
  )
    throw new Error("Export up to 10 minutes at a time.");
  return op;
}

export function validateMediaUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid video URL.");
  }
  const fixture =
    process.env.HANSFIELD_TEST_MODE === "1" &&
    url.origin === "http://127.0.0.1:4319";
  const allowed =
    /(?:^|\.)(?:cloudfront\.net|higgsfield\.ai|fal\.media|replicate\.delivery|blob\.vercel-storage\.com)$/.test(
      url.hostname,
    );
  if (
    (!fixture && (url.protocol !== "https:" || !allowed)) ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use a video from your Higgsfield library, or upload a video first.",
    );
  return url;
}

async function run(
  binary: string,
  args: string[],
  timeout = 120000,
): Promise<string> {
  await access(binary).catch(() => {
    throw new Error(
      "The video editor needs FFmpeg and FFprobe installed on the server. Run pnpm install, or configure FFMPEG_PATH and FFPROBE_PATH.",
    );
  });
  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      process.kill();
      reject(
        new Error(
          "Video processing timed out. Try a shorter film or 720p export.",
        ),
      );
    }, timeout);
    process.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-2_000_000);
    });
    process.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-12000);
    });
    process.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    process.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(
            /Invalid data|moov atom|does not contain any stream/i.test(stderr)
              ? "This file is not a readable video. Upload an MP4 with a video track."
              : "Video processing failed. Check the clip and cut points, or try a smaller export.",
          ),
        );
    });
  });
}
const ffmpeg = () => process.env.FFMPEG_PATH || ffmpegPath || "ffmpeg";
const probe = () => process.env.FFPROBE_PATH || ffprobe.path;

async function metadata(file: string, url: string): Promise<Clip> {
  const json = await run(
    probe(),
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ],
    20000,
  );
  const data = JSON.parse(json) as {
    format?: { duration?: string };
    streams?: {
      codec_type: string;
      width?: number;
      height?: number;
      duration?: string;
    }[];
  };
  const video = data.streams?.find((s) => s.codec_type === "video");
  const duration = Number(video?.duration ?? data.format?.duration);
  if (
    !video ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 600 ||
    !video.width ||
    !video.height ||
    video.width > 8192 ||
    video.height > 8192
  )
    throw new Error("Choose a readable video up to 10 minutes and 8K.");
  return {
    url,
    duration,
    width: video.width,
    height: video.height,
    hasAudio: !!data.streams?.some((s) => s.codec_type === "audio"),
  };
}

async function download(raw: string, file: string): Promise<number> {
  let url = validateMediaUrl(raw);
  let response: Response | undefined;
  for (let i = 0; i < 4; i++) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next)
        throw new Error("Video download redirected without a location.");
      url = validateMediaUrl(new URL(next, url).href);
    } else break;
  }
  if (!response?.ok || !response.body)
    throw new Error(
      "Could not read this video. The provider URL may have expired; upload a saved copy.",
    );
  if (Number(response.headers.get("content-length")) > MAX_FILE) {
    await response.body.cancel();
    throw new Error("Choose clips smaller than 100 MB.");
  }
  const output = createWriteStream(file, { flags: "wx" });
  const reader = response.body.getReader();
  let total = 0;
  let streamError: Error | undefined;
  output.on("error", (error) => {
    streamError = error;
  });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE)
        throw new Error("Choose clips smaller than 100 MB.");
      if (streamError) throw streamError;
      if (!output.write(value)) await once(output, "drain");
    }
    output.end();
    await once(output, "finish");
  } catch (error) {
    output.destroy();
    await reader.cancel().catch(() => {});
    throw error;
  }
  return total;
}

let processing = 0;
export async function processMedia(op: MediaOperation): Promise<{
  metadata?: Clip;
  bytes?: Buffer;
  contentType?: string;
  duration?: number;
}> {
  if (processing >= 2)
    throw new Error(
      "The video editor is busy. Wait for the current export and try again.",
    );
  processing++;
  const root = path.resolve(tmpdir());
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(root, "hansfield-film-"));
    const sources = new Map<string, { file: string; clip: Clip }>();
    let total = 0;
    for (const cut of op.clips) {
      if (sources.has(cut.url)) continue;
      const file = path.join(directory, `source-${sources.size}.mp4`);
      total += await download(cut.url, file);
      if (total > MAX_TOTAL)
        throw new Error("Keep source media under 500 MB per export.");
      sources.set(cut.url, { file, clip: await metadata(file, cut.url) });
    }
    const first = sources.get(op.clips[0]!.url)!;
    if (op.mode === "inspect") return { metadata: first.clip };
    if (op.mode === "frame") {
      if (op.time! > first.clip.duration + 0.02 || op.time! <= 0)
        throw new Error("Choose a frame before the end of the video.");
      const end = Math.min(op.time!, first.clip.duration);
      const seek = Math.max(0, op.clips[0]?.start ?? 0, end - 1);
      const output = path.join(directory, "frame.jpg");
      await run(
        ffmpeg(),
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-protocol_whitelist",
          "file,pipe",
          "-ss",
          String(seek),
          "-i",
          first.file,
          "-t",
          String(end - seek),
          "-frames:v",
          "1",
          "-vf",
          "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease,reverse",
          "-q:v",
          "2",
          "-y",
          output,
        ],
        30000,
      );
      return {
        bytes: await readFile(output).catch(() => {
          throw new Error(
            "Could not extract an ending frame. Move the trim end slightly and try again.",
          );
        }),
        contentType: "image/jpeg",
      };
    }
    const sizes = {
      landscape: [1280, 720],
      portrait: [720, 1280],
      square: [720, 720],
    };
    let [width, height] = sizes[op.format ?? "landscape"]!;
    if (op.resolution === "1080p") {
      width = width! * 1.5;
      height = height! * 1.5;
    }
    if (op.mode === "trim") {
      const factor = Math.min(
        1,
        1920 / Math.max(first.clip.width, first.clip.height),
      );
      width = Math.max(2, Math.floor((first.clip.width * factor) / 2) * 2);
      height = Math.max(2, Math.floor((first.clip.height * factor) / 2) * 2);
    }
    const normalized: string[] = [];
    const durations: number[] = [];
    for (let i = 0; i < op.clips.length; i++) {
      const cut = op.clips[i]!;
      const source = sources.get(cut.url)!;
      if (
        cut.end > source.clip.duration + 0.05 ||
        cut.start >= source.clip.duration
      )
        throw new Error(`Shot ${i + 1}: the cut is outside the actual clip.`);
      const duration = Math.min(cut.end, source.clip.duration) - cut.start;
      durations.push(duration);
      const output = path.join(directory, `clip-${i}.mp4`);
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-ss",
        String(cut.start),
        "-i",
        source.file,
      ];
      const keepAudio = source.clip.hasAudio && !op.muted && !cut.muted;
      if (!keepAudio)
        args.push(
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      args.push(
        "-t",
        String(duration),
        "-map",
        "0:v:0",
        "-map",
        keepAudio ? "0:a:0" : "1:a:0",
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`,
        "-af",
        "aresample=48000,apad",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-y",
        output,
      );
      await run(ffmpeg(), args);
      normalized.push(output);
    }
    const output = path.join(directory, "film.mp4");
    let duration = durations.reduce((n, d) => n + d, 0);
    if (op.transition === "fade" && normalized.length > 1) {
      const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
      normalized.forEach((file) =>
        args.push("-protocol_whitelist", "file,pipe", "-i", file),
      );
      const filters: string[] = [];
      let elapsed = durations[0]!;
      for (let i = 1; i < normalized.length; i++) {
        const fade = Math.min(0.35, durations[i - 1]! / 3, durations[i]! / 3);
        const video = i === 1 ? "0:v" : `v${i - 1}`;
        const audio = i === 1 ? "0:a" : `a${i - 1}`;
        filters.push(
          `[${video}][${i}:v]xfade=transition=fade:duration=${fade}:offset=${elapsed - fade}[v${i}]`,
          `[${audio}][${i}:a]acrossfade=d=${fade}[a${i}]`,
        );
        elapsed += durations[i]! - fade;
      }
      duration = elapsed;
      args.push(
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        filters.join(";"),
        "-map",
        `[v${normalized.length - 1}]`,
        "-map",
        `[a${normalized.length - 1}]`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-y",
        output,
      );
      await run(ffmpeg(), args, 180000);
    } else {
      await writeFile(
        path.join(directory, "concat.txt"),
        normalized.map((_, i) => `file 'clip-${i}.mp4'`).join("\n"),
      );
      await run(ffmpeg(), [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-f",
        "concat",
        "-safe",
        "1",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        path.join(directory, "concat.txt"),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        output,
      ]);
    }
    return {
      bytes: await readFile(output),
      contentType: "video/mp4",
      duration,
    };
  } finally {
    processing--;
    // Only clean up the unique temporary directory created by this invocation.
    if (
      directory &&
      path.dirname(path.resolve(directory)) === root &&
      path.basename(directory).startsWith("hansfield-film-")
    )
      await rm(directory, { recursive: true, force: true });
  }
}
