import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function plan(
  page: Page,
  story = "A traveler enters the forest.\nShe reaches a moonlit lake.",
  target = "10",
) {
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page.getByLabel("Film story", { exact: true }).fill(story);
  await page.getByLabel("Target film length").selectOption(target);
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
}

test("connected film uses the previous kept ending, then trims, splits, exports and reloads", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const submissions: {
    plane: {
      media: Record<string, { url: string }[]>;
      prompt: { text: string };
    };
  }[] = [];
  const frames: number[] = [];
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generations"))
      submissions.push(request.postDataJSON());
    if (request.url().endsWith("/api/film/process")) {
      const op = request.postDataJSON();
      if (op.mode === "frame") frames.push(op.time);
    }
  });
  await page.route("**/api/upload", async (route) => {
    const bytes = route.request().postDataBuffer()!;
    expect(bytes.includes(Buffer.from([0xff, 0xd8]))).toBe(true);
    expect(bytes.toString("latin1")).toContain("image/jpeg");
    uploads++;
    await route.fulfill({
      json: { url: `https://fixture.cloudfront.net/frame-${uploads}.jpg` },
    });
  });
  await plan(page);
  await page.getByLabel("Film title").fill("Connected forest");
  await page.getByRole("button", { name: "01 Story", exact: true }).click();
  await page
    .getByText("Keep characters and style consistent", { exact: true })
    .click();
  await page
    .getByLabel("Shared continuity notes")
    .fill("Same traveler in a blue coat, braided hair, cool moonlit lighting.");
  await page.getByRole("button", { name: "02 Shots", exact: true }).click();
  await expect(page.locator(".film-shot")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  await page.getByLabel("Trim end seconds").fill("2.5");
  await page
    .getByRole("button", { name: "Generate remaining (1)", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "2 ready",
    { timeout: 45000 },
  );
  expect(submissions).toHaveLength(2);
  expect(submissions[0]!.plane.prompt.text).toContain("blue coat");
  expect(submissions[1]!.plane.media.start![0]!.url).toBe(
    "https://fixture.cloudfront.net/frame-1.jpg",
  );
  expect(frames).toHaveLength(1);
  expect(frames[0]).toBeCloseTo(2.5, 2);
  expect(uploads).toBe(1);
  await page.getByRole("button", { name: "Edit shot 1", exact: true }).click();
  const playhead = page.getByLabel("Shot playhead", { exact: true });
  const bounds = (await playhead.boundingBox())!;
  await playhead.click({
    position: { x: bounds.width / 2, y: bounds.height / 2 },
  });
  await expect(page.locator(".film-playhead")).not.toContainText("Playhead 0s");
  await page
    .getByRole("button", { name: "Split at playhead", exact: true })
    .click();
  await expect(page.locator(".film-shot")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Generate remaining (0)", exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "04 Export", exact: true }).click();
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Connected-forest.mp4");
  expect((await readFile((await file.path())!)).length).toBeGreaterThan(10000);
  const preview = page.getByLabel("Assembled film preview");
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((el) => (el as HTMLVideoElement).readyState))
    .toBeGreaterThan(0);
  expect(
    await preview.evaluate((el) => (el as HTMLVideoElement).duration),
  ).toBeGreaterThan(3);
  await page.reload();
  await expect(page.locator(".film-shot")).toHaveCount(3);
  await expect(page.locator(".film-timeline-caption")).toContainText("3 ready");
  expect(submissions).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("shot settings and composer edits update the existing planned shot", async ({
  page,
}) => {
  await plan(page);
  await page.getByLabel("Shot duration (s)", { exact: true }).fill("6");
  await page
    .getByLabel("Shot resolution", { exact: true })
    .selectOption("1080p");
  await page.getByRole("button", { name: "Load shot 1 into composer" }).click();
  await page
    .locator("#studio-prompt")
    .fill("The same traveler turns toward a sunlit ridge.");
  await page
    .getByRole("button", { name: "Apply to shot", exact: true })
    .click();
  await expect(page.getByLabel("Shot action", { exact: true })).toHaveValue(
    "The same traveler turns toward a sunlit ridge.",
  );
  await expect(
    page.getByLabel("Shot duration (s)", { exact: true }),
  ).toHaveValue("6");
  await expect(page.getByLabel("Shot resolution", { exact: true })).toHaveValue(
    "1080p",
  );
  await expect(page.locator(".film-shot")).toHaveCount(2);
});

test("film submissions recover from a lost response using the same intent, without duplicate clips", async ({
  page,
}) => {
  const identities: string[] = [];
  const accepted: string[] = [];
  let lose = true;
  await page.route("**/api/generations", async (route) => {
    identities.push(route.request().postDataJSON().idempotencyKey);
    const response = await route.fetch();
    accepted.push((await response.json()).requestId);
    if (lose) {
      lose = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await plan(page, "A quiet single shot.");
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume shot", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Resume shot", exact: true }).click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  expect(identities).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("hansfield.storyboard.v1")!).state
          .shots[0].clipRevision,
    ),
  ).toBe(accepted[0]);
  await expect(page.locator(".ohf-tile--failed")).toHaveCount(0);
});

test.describe("explicit film approval", () => {
  test.use({ autoApproveSpend: false });
  test("accepted film jobs resume after refresh and the remaining plan stays explicit", async ({
    page,
  }) => {
    let submissions = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/generations")) submissions++;
    });
    await plan(page);
    await page
      .getByRole("button", { name: "Generate remaining (2)", exact: true })
      .click();
    await page.getByRole("button", { name: /^Approve .* estimate$/ }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("hansfield.storyboard.v1")!).state
              .shots[0].job?.requestId,
        ),
      )
      .toBeTruthy();
    await page.reload();
    await expect(page.locator(".film-timeline-caption")).toContainText(
      "1 ready",
      { timeout: 40000 },
    );
    await expect(
      page.getByRole("button", { name: "Generate remaining (1)", exact: true }),
    ).toBeEnabled();
    expect(submissions).toBe(1);
  });
});

test("stopping a film waits for its current shot and avoids submitting later shots", async ({
  page,
}) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generations")) submissions++;
  });
  await plan(page);
  await page
    .getByRole("button", { name: "Generate remaining (2)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Stop after current shot", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  await expect(
    page.getByRole("button", { name: "Generate remaining (1)", exact: true }),
  ).toBeEnabled();
  expect(submissions).toBe(1);
});

test("video continuity uses the actual trimmed portion and uploads a video reference", async ({
  page,
}) => {
  test.setTimeout(120000);
  const submitted: { plane: { media: Record<string, { url: string }[]> } }[] =
    [];
  let videoUploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generations"))
      submitted.push(request.postDataJSON());
  });
  await page.route("**/api/upload", async (route) => {
    expect(route.request().postDataBuffer()!.toString("latin1")).toContain(
      "video/mp4",
    );
    videoUploads++;
    await route.fulfill({
      json: { url: "https://fixture.cloudfront.net/kept-video.mp4" },
    });
  });
  await plan(page);
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  await page.getByLabel("Trim start seconds").fill("0.5");
  await page.getByLabel("Trim end seconds").fill("2");
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await page.getByLabel("Shot continuity").selectOption("video");
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "2 ready",
    { timeout: 50000 },
  );
  expect(videoUploads).toBe(1);
  expect(submitted[1]!.plane.media.video![0]!.url).toBe(
    "https://fixture.cloudfront.net/kept-video.mp4",
  );
  expect(submitted[1]!.plane.media.start).toBeUndefined();
});

test("mobile film planner and timeline stay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await plan(page);
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await expect(page.getByLabel("Shot action")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
