import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { connectPreview } from "./connect-preview.mjs";

// Reuses an existing live result. This check never submits a generation.
const [record] = JSON.parse(
  await readFile("artifacts/live-history.json", "utf8"),
);
if (!record?.urls?.[0])
  throw new Error(
    "Run the opted-in live smoke check first, or provide its saved history.",
  );
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
try {
  const baseURL = process.env.HANSFIELD_VERIFY_URL || "http://localhost:3000";
  const page = await browser.newPage({
    baseURL,
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  let generationAttempts = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/generations", async (route) => {
    generationAttempts++;
    await route.abort();
  });
  await page.goto(baseURL);
  await connectPreview(page, baseURL);
  await page.getByRole("button", { name: "Films", exact: true }).click();
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  const inspect = await page.request.post("/api/film/process", {
    data: { mode: "inspect", clips: [{ url: record.urls[0] }] },
  });
  if (!inspect.ok()) throw new Error(await inspect.text());
  const clip = await inspect.json();
  const frame = await page.request.post("/api/film/process", {
    data: {
      mode: "frame",
      clips: [{ url: clip.url, start: 0, end: clip.duration }],
      time: clip.duration,
    },
  });
  if (!frame.ok()) throw new Error(await frame.text());
  const frameBytes = await frame.body();
  if (frameBytes.readUInt16BE(0) !== 0xffd8)
    throw new Error("Ending frame is not a JPEG.");
  await writeFile("artifacts/actual-ending-frame.jpg", frameBytes);
  const board = {
    version: 2,
    title: "Desert journey",
    notes: "Same traveler, golden dawn light, continuous aerial movement.",
    shots: [
      {
        id: "live-source",
        title: "Across the dunes",
        continuity: "none",
        clip,
        trimStart: 0,
        trimEnd: clip.duration,
        plane: {
          model: "seedance-2.5",
          prompt: { text: record.prompt },
          media: {},
          settings: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
        },
      },
    ],
  };
  await page
    .locator('.studio-board input[type="file"][accept=".json"]')
    .setInputFiles({
      name: "film.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(board)),
    });
  const playhead = page.getByLabel("Shot playhead", { exact: true });
  await playhead.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Shot 1 preview"]')?.readyState >= 2,
    { timeout: 30000 },
  );
  const bounds = await playhead.boundingBox();
  await playhead.click({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await page
    .getByRole("button", { name: "Split at playhead", exact: true })
    .click();
  if ((await page.locator(".film-shot").count()) !== 2)
    throw new Error("Split did not retain both halves.");
  await page.getByRole("button", { name: "04 Export", exact: true }).click();
  await page
    .getByLabel("Film transitions", { exact: true })
    .selectOption("fade");
  const download = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  await (await download).saveAs("artifacts/connected-film-demo.mp4");
  const preview = page.getByLabel("Assembled film preview");
  await preview.waitFor();
  await preview.evaluate(async (video) => {
    await video.play();
  });
  const playback = await preview.evaluate((video) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    paused: video.paused,
  }));
  if (playback.paused || playback.duration <= 1)
    throw new Error("Export did not play.");
  await page.locator(".film-workbench").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/film-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "artifacts/film-mobile.png", fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  const run = promisify(execFile);
  const { stdout } = await run(ffprobe.path, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    "artifacts/connected-film-demo.mp4",
  ]);
  const info = JSON.parse(stdout);
  await run(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      "artifacts/connected-film-demo.mp4",
      "-f",
      "null",
      "-",
    ],
    { timeout: 30000 },
  );
  const sourcePlayback = await page
    .getByLabel("Shot 1 preview", { exact: true })
    .evaluate((video) => ({
      readyState: video.readyState,
      duration: video.duration,
      error: video.error?.message,
    }));
  const report = {
    sourceDuration: clip.duration,
    sourcePlayback,
    playback,
    streams: info.streams.map((s) => ({
      type: s.codec_type,
      codec: s.codec_name,
      width: s.width,
      height: s.height,
    })),
    endingFrameBytes: frameBytes.length,
    errors,
    mobileOverflow: overflow,
    generationAttempts,
  };
  await writeFile(
    "artifacts/film-verification.json",
    JSON.stringify(report, null, 2),
  );
  if (errors.length || overflow || generationAttempts)
    throw new Error(
      "Film verification failed: see artifacts/film-verification.json",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
