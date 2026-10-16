import { test, expect } from "./fixtures";
import type { GenerationPlane } from "../../src/generation/catalog";

test("film shots expose Studio controls, persist independently and submit native direction", async ({
  page,
}) => {
  const errors: string[] = [];
  const submissions: GenerationPlane[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/generations", async (route) => {
    submissions.push(route.request().postDataJSON().plane);
    await route.continue();
  });
  await page.goto("/");
  await page.getByText("Creative controls", { exact: true }).click();
  await expect(page.getByLabel(/^Camera movement$/i)).toBeVisible();
  const studioLabels = await page
    .locator(".studio-setting-grid select, .studio-setting-grid input")
    .evaluateAll((fields) =>
      fields.map((field) => field.getAttribute("aria-label")!),
    );
  const optionValues = await page
    .getByLabel(/^Camera movement$/i)
    .locator("option")
    .evaluateAll((options) =>
      options.map((el) => (el as HTMLOptionElement).value),
    );
  await page.getByRole("button", { name: "Films", exact: true }).click();
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill("A traveler crosses a desert.\nThe traveler reaches a stone arch.");
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await page.getByLabel("Shot model", { exact: true }).selectOption("cinema-4");
  const controls = page.getByRole("group", {
    name: "Video settings",
    exact: true,
  });
  for (const studioLabel of studioLabels) {
    const label =
      studioLabel === "Duration" ? "duration (s)" : studioLabel.toLowerCase();
    await expect(
      controls.getByLabel(`Shot ${label}`, { exact: true }),
    ).toBeVisible();
  }
  expect(
    await page
      .getByLabel("Shot camera movement", { exact: true })
      .locator("option")
      .evaluateAll((options) =>
        options.map((el) => (el as HTMLOptionElement).value),
      ),
  ).toEqual(optionValues);
  const direction: Record<string, string> = {
    "camera movement": "dolly-in",
    "camera lens": "anamorphic",
    "camera model": "35mm-film",
    "camera aperture": "f14-wide-open",
    light: "silhouette",
    pacing: "calm",
    genre: "drama",
    era: "1980s",
    "color palette": "amber-wasteland",
  };
  for (const [label, value] of Object.entries(direction))
    await page.getByLabel(`Shot ${label}`, { exact: true }).selectOption(value);
  await page.getByLabel("Shot generate audio", { exact: true }).uncheck();
  await page.getByLabel("Shot duration (s)", { exact: true }).fill("6");
  await page
    .getByLabel("Shot aspect ratio", { exact: true })
    .selectOption("9:16");
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await expect(page.getByLabel("Shot model", { exact: true })).toHaveValue(
    "seedance-2.5",
  );
  await expect(
    page.getByLabel("Shot generate audio", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Shot camera movement", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Edit shot 1", exact: true }).click();
  for (const [label, value] of Object.entries(direction))
    await expect(page.getByLabel(`Shot ${label}`, { exact: true })).toHaveValue(
      value,
    );
  await expect(
    page.getByLabel("Shot generate audio", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(
    page.getByLabel("Shot camera movement", { exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  expect(submissions).toHaveLength(1);
  expect(submissions[0]!.settings).toMatchObject({
    duration: 6,
    aspectRatio: "9:16",
    generateAudio: false,
    cameraMovement: "dolly-in",
    cameraLens: "anamorphic",
    cameraModel: "35mm-film",
    cameraAperture: "f14-wide-open",
    light: "silhouette",
    pacing: "calm",
    genre: "drama",
    era: "1980s",
    colorPalette: "amber-wasteland",
  });
  await page.screenshot({
    path: "artifacts/film-shot-settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Shot camera movement", { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/film-shot-settings-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page
    .getByLabel("Shot camera movement", { exact: true })
    .selectOption("pan-left");
  await expect(page.locator(".film-editor-heading")).toContainText(
    "Needs regeneration",
  );
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByText("Creative controls", { exact: true }).click();
  await expect(page.getByLabel(/^Camera movement$/i)).toHaveValue("");
  expect(errors).toEqual([]);
});

test("film model switches expose booleans, optional controls and fractional ranges", async ({
  page,
}) => {
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill("A traveler studies the horizon.");
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await page
    .getByLabel("Shot bitrate mode", { exact: true })
    .selectOption("standard");
  await page.getByLabel("Shot generate audio", { exact: true }).uncheck();
  await page.reload();
  await expect(
    page.getByLabel("Shot bitrate mode", { exact: true }),
  ).toHaveValue("standard");
  await expect(
    page.getByLabel("Shot generate audio", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel("Shot model", { exact: true })
    .selectOption("kling-3-pro");
  await expect(
    page.getByLabel("Shot bitrate mode", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Shot cfg", { exact: true }).fill("0.65");
  await page.getByLabel("Shot sound", { exact: true }).uncheck();
  await page.reload();
  await expect(page.getByLabel("Shot cfg", { exact: true })).toHaveValue(
    "0.65",
  );
  await expect(
    page.getByLabel("Shot sound", { exact: true }),
  ).not.toBeChecked();
  await page.getByLabel("Shot model", { exact: true }).selectOption("cinema-4");
  await expect(page.getByLabel("Shot cfg", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Shot camera movement", { exact: true })
    .selectOption("tracking");
  await page
    .getByLabel("Shot camera movement", { exact: true })
    .selectOption("");
  await expect(
    page.getByLabel("Shot camera movement", { exact: true }),
  ).toHaveValue("");
});

test("film controls follow the selected frame or video continuity input", async ({
  page,
}) => {
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill(
      "A traveler climbs the ridge.\nThe traveler looks across the valley.",
    );
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await expect(page.getByLabel("Shot continuity", { exact: true })).toHaveValue(
    "frame",
  );
  await expect(
    page.getByLabel("Shot aspect ratio", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Shot format", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Shot bitrate mode", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Shot continuity", { exact: true })
    .selectOption("video");
  await expect(
    page.getByLabel("Shot aspect ratio", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Shot format", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Shot continuity", { exact: true })
    .selectOption("none");
  await expect(page.getByLabel("Shot format", { exact: true })).toBeVisible();
  await page
    .getByLabel("Shot model", { exact: true })
    .selectOption("kling-3-pro");
  await page
    .getByLabel("Shot continuity", { exact: true })
    .selectOption("frame");
  await expect(
    page.getByLabel("Shot aspect ratio", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Shot cfg", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Shot sound", { exact: true })).toBeVisible();
});
