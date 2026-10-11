import { test, expect, type Page } from "@playwright/test";

const imported = {
  version: 2,
  title: "Cut study",
  notes: "Same traveler",
  shots: [0, 1].map((i) => ({
    id: `source-${i}`,
    title: `Scene ${i + 1}`,
    continuity: "none",
    trimStart: i * 0.8,
    trimEnd: i * 0.8 + 1,
    clip: {
      url: "http://127.0.0.1:4319/media/video.mp4",
      duration: 5.005,
      width: 960,
      height: 540,
      hasAudio: true,
    },
    plane: {
      model: "seedance-2.5",
      prompt: { text: "The traveler moves naturally." },
      media: {},
      settings: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    },
  })),
};
async function openImported(page: Page) {
  await page.goto("/?workspace=films");
  await page
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await page.locator('.film-projects input[type="file"]').setInputFiles({
    name: "cut.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByLabel("Film title")).toHaveValue("Cut study");
}

test("projects preserve separate stories, alternate cuts, undo, archive and bookmarks", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: /A small adventure/ }).click();
  await page.getByLabel("Film title").fill("Original film");
  await page
    .getByRole("button", { name: "Remove shot 2", exact: true })
    .click();
  await expect(page.locator(".film-shot")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo film edit", exact: true })
    .click();
  await expect(page.locator(".film-shot")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Redo film edit", exact: true })
    .click();
  await expect(page.locator(".film-shot")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo film edit", exact: true })
    .click();
  const originalURL = page.url();
  await page.getByRole("button", { name: "← All films", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicate film Original film", exact: true })
    .click();
  await expect(page.getByLabel("Film title")).toHaveValue(
    "Original film · alternate cut",
  );
  await page
    .getByRole("button", { name: "Remove shot 1", exact: true })
    .click();
  await page.getByRole("button", { name: "01 Story", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill("An alternate ending.");
  await page.reload();
  await page.getByRole("button", { name: "01 Story", exact: true }).click();
  await expect(page.getByLabel("Film story", { exact: true })).toHaveValue(
    "An alternate ending.",
  );
  await page.goto(originalURL);
  await expect(page.locator(".film-shot")).toHaveCount(3);
  await page.getByRole("button", { name: "01 Story", exact: true }).click();
  await expect(page.getByLabel("Film story", { exact: true })).toHaveValue(
    /misty forest/,
  );
  await page.getByRole("button", { name: "← All films", exact: true }).click();
  const original = page.locator(".project-card").filter({
    has: page.getByRole("button", {
      name: "Open film Original film",
      exact: true,
    }),
  });
  await original.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open film Original film", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Active films", exact: true }).click();
  await page.getByLabel("Search film projects").fill("Original film");
  await expect(page.locator(".project-card")).toHaveCount(2);
  expect(hydrationErrors).toEqual([]);
});

test("review plays kept clips in sequence and export can create a selected portrait cut", async ({
  page,
}) => {
  await openImported(page);
  await page.getByRole("button", { name: "03 Review", exact: true }).click();
  await page
    .getByRole("button", { name: "Play sequence", exact: true })
    .click();
  await expect(page.locator(".review-monitor-bar")).toContainText("2 / 2");
  await expect
    .poll(() =>
      page
        .getByLabel("Film sequence preview")
        .evaluate((el) => (el as HTMLVideoElement).paused),
    )
    .toBe(true);
  await page.getByRole("button", { name: "04 Export", exact: true }).click();
  await page.getByLabel("Export scope").selectOption("selected");
  await page.getByLabel("Include shot 2 in export").uncheck();
  await page.getByLabel("Film export canvas").selectOption("portrait");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  await downloaded;
  const output = page.getByLabel("Assembled film preview");
  await expect
    .poll(() => output.evaluate((el) => (el as HTMLVideoElement).readyState))
    .toBeGreaterThan(0);
  const facts = await output.evaluate((el) => {
    const video = el as HTMLVideoElement;
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  });
  expect(facts.duration).toBeLessThan(1.2);
  expect(facts.height).toBeGreaterThan(facts.width);
  await page.getByLabel("Include shot 1 in export").uncheck();
  await expect(
    page.getByRole("button", { name: "Export film", exact: true }),
  ).toBeDisabled();
});

test("invalid project import preserves existing films and shot direction closes with Escape", async ({
  page,
}) => {
  await openImported(page);
  await page
    .getByRole("button", { name: "Advanced direction", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Advanced shot direction" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Advanced shot direction" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "← All films", exact: true }).click();
  await page.locator('.film-projects input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":2,"title":"Broken","shots":[{}]}'),
  });
  await expect(page.locator(".workspace-error")).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open film Cut study", exact: true })
    .click();
  await expect(page.locator(".film-shot")).toHaveCount(2);
});

test("the library can search and filter media and reuse returns to the composer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Describe your scene").fill("A quiet olive grove.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(page.locator(".studio-composer")).toHaveCount(0);
  await page.getByLabel("Library media filter").selectOption("image");
  await expect(page.locator(".ohf-tile")).toHaveCount(0);
  await page.getByLabel("Library media filter").selectOption("video");
  await page.getByLabel("Search creations").fill("olive");
  await expect(page.locator(".ohf-tile")).toHaveCount(1);
  await page.locator(".ohf-tile").hover();
  await page.getByRole("button", { name: /Reuse/ }).click();
  await expect(page.getByLabel("Describe your scene")).toHaveValue(
    "A quiet olive grove.",
  );
});

test("a film shot can be canceled and another project can then be opened", async ({
  page,
}) => {
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill("[queued] A quiet forest scene.");
  await page.getByLabel("Target film length").selectOption("10");
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel shot", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel shot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "← All films", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "← All films", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "+ New film", exact: true }),
  ).toBeEnabled();
});
