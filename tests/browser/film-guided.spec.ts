import { test, expect } from "./fixtures";
test.use({ autoApproveSpend: false });

test("projects can be renamed, deleted with confirmation, restored and remain deleted after reload", async ({
  page,
}) => {
  await page.goto("/?workspace=films");
  await expect(
    page.getByText("Start with a direction", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".project-starters")).toHaveCount(0);
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill("Launch film");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByLabel("Film title")).toHaveValue("Launch film");
  await page.getByRole("button", { name: "← All films", exact: true }).click();
  await page
    .getByRole("button", { name: "Rename film Launch film", exact: true })
    .click();
  await page.getByLabel("Project name", { exact: true }).fill("Campaign film");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open film Campaign film", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete film Campaign film", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open film Campaign film", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete film Campaign film", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open film Campaign film", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Undo project deletion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open film Campaign film", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your film projects." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open film Campaign film", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".project-card")).toHaveCount(0);
});

test("guided film creation explains the plan and leads from scenes through generation to a playable export", async ({
  page,
}) => {
  // The fixture's signed-storage host is deliberately non-routable. Native
  // ending-frame extraction still runs; only the storage transfer is replaced.
  await page.route("**/api/upload", (route) =>
    route.fulfill({
      json: { url: "https://fixture.cloudfront.net/guided-continuity.jpg" },
    }),
  );
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What happens in your film?" }),
  ).toBeVisible();
  await expect(page.getByLabel("Film story", { exact: true })).toHaveValue("");
  await page
    .getByLabel("Film story", { exact: true })
    .fill("A traveler enters the forest.\nShe reaches a moonlit lake.");
  await expect(page.locator(".film-plan-numbers")).toContainText("2");
  await expect(page.locator(".film-plan-numbers")).toContainText("10 seconds");
  await page.screenshot({
    path: "artifacts/guided-film-story.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bring each scene to life." }),
  ).toBeVisible();
  await expect(page.locator(".film-shot")).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/guided-film-shots.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Generate remaining (2)", exact: true })
    .click();
  await page.getByRole("button", { name: /^Approve .* estimate$/ }).click();
  await page.getByRole("button", { name: /^Approve .* estimate$/ }).click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "2 ready",
    { timeout: 50000 },
  );
  await page
    .getByRole("button", { name: "Continue to review →", exact: true })
    .click();
  await expect(page.getByLabel("Film sequence preview")).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to export →", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your film, ready to share." }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export film", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
  await expect(page.getByLabel("Assembled film preview")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "01 Story", exact: true }).click();
  await page.screenshot({
    path: "artifacts/guided-film-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
});
