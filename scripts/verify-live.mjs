import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { connectPreview } from "./connect-preview.mjs";

// Opt-in live smoke check. One short generation uses the configured account's credits.
// Never run as part of the automated test suite.
if (
  !process.argv.includes("--resume") &&
  process.env.HANSFIELD_LIVE_VERIFY !== "1"
)
  throw new Error(
    "Set HANSFIELD_LIVE_VERIFY=1 to run a single live generation.",
  );
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.HANSFIELD_VERIFY_URL || "http://localhost:3000");
  await connectPreview(
    page,
    process.env.HANSFIELD_VERIFY_URL || "http://localhost:3000",
  );
  await page.getByLabel("Generation model").selectOption("cinema-4");
  await page
    .getByLabel("Describe your scene")
    .fill(
      "A cinematic wide shot of a lone traveler walking across vast desert dunes at dawn. Wind lifts fine sand from the dune ridges, golden backlight outlines the traveler's silhouette. A single calm continuous shot with a slow aerial pullback. Natural movement, a coherent landscape, no text or logos.",
    );
  await page.getByLabel("Resolution", { exact: true }).selectOption("480p");
  await page.getByLabel("Duration", { exact: true }).press("Home");
  await page.getByLabel("Generate audio", { exact: true }).uncheck();
  await page.getByText("Creative controls", { exact: true }).click();
  await page
    .getByLabel("Camera Movement", { exact: true })
    .selectOption("aerial-pullback");
  await page
    .getByLabel("Camera Lens", { exact: true })
    .selectOption("anamorphic");
  await page.getByLabel("Light", { exact: true }).selectOption("contre-jour");
  await page.getByLabel("Pacing", { exact: true }).selectOption("single-shot");
  const resume = process.argv.includes("--resume");
  if (resume) {
    const receipt = JSON.parse(
      await readFile("artifacts/live-receipt.json", "utf8"),
    );
    if (!receipt.result?.requestId)
      throw new Error("No accepted live request to resume.");
    await page.evaluate(({ requestId, statusUrl }) => {
      localStorage.setItem(
        "openhiggsfield.history.v1",
        JSON.stringify([
          {
            id: requestId,
            requestId,
            statusUrl,
            status: "running",
            phase: "queued",
            surface: "video",
            kind: "video",
            modelId: "cinema-4",
            modelLabel: "Cinema Studio 4.0",
            prompt:
              document.querySelector("textarea")?.value ||
              "A cinematic desert scene at dawn.",
            ratio: "16 / 9",
            meta: "480p · 4s",
            urls: [],
            art: "linear-gradient(135deg, #173c35, #be986c)",
            createdAt: Date.now(),
          },
        ]),
      );
    }, receipt.result);
    await page.reload();
    console.log(
      `Resuming existing live request ${receipt.result.requestId}; no new submission.`,
    );
  } else {
    const receipt = page.waitForResponse(
      (response) => response.url().endsWith("/api/generations"),
      { timeout: 70000 },
    );
    await page
      .getByRole("button", { name: "Generate video", exact: true })
      .click();
    const response = await receipt;
    const result = await response.json();
    await writeFile(
      "artifacts/live-receipt.json",
      JSON.stringify({ status: response.status(), result, errors }, null, 2),
    );
    console.log(
      `Live submission: HTTP ${response.status()}${result.requestId ? ` / request ${result.requestId}` : ""}`,
    );
    if (!response.ok()) {
      console.log(result.error);
      await page.screenshot({
        path: "artifacts/live-error.png",
        fullPage: true,
      });
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) {
    await page
      .getByRole("button", { name: "Inspect latest creation" })
      .waitFor({ timeout: 8 * 60000 });
    const video = page.locator(".studio-viewfinder video");
    await video.waitFor();
    const url = await video.getAttribute("src");
    const media = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!media.ok) throw new Error(`Output download failed: ${media.status}`);
    await writeFile(
      "artifacts/live-video.mp4",
      Buffer.from(await media.arrayBuffer()),
    );
    await video.evaluate(async (el) => {
      el.muted = true;
      await el.play();
    });
    await page.waitForFunction(() => {
      const video = document.querySelector(".studio-viewfinder video");
      return video && video.readyState >= 2 && video.currentTime > 0;
    });
    await page.screenshot({
      path: "artifacts/live-completed.png",
      fullPage: true,
    });
    await writeFile(
      "artifacts/live-history.json",
      await page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const open = indexedDB.open("openhiggsfield", 1);
            open.onsuccess = () => {
              const request = open.result
                .transaction("kv", "readonly")
                .objectStore("kv")
                .get("history.v1");
              request.onsuccess = () => {
                resolve(JSON.stringify(request.result));
                open.result.close();
              };
              request.onerror = () => reject(request.error);
            };
            open.onerror = () => reject(open.error);
          }),
      ),
    );
    console.log(
      `Live generation completed; saved artifacts/live-video.mp4. Browser errors: ${errors.length}.`,
    );
  }
} finally {
  await browser.close();
}
