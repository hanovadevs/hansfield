import { test, expect } from "./fixtures";
import type { GenerationPlane } from "../../src/generation/catalog";

test("Grok continuation uses a real signed upload, retries storage interruption and preserves the previous clip on failure", async ({
  page,
}) => {
  test.setTimeout(120000);
  const submissions: GenerationPlane[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generations"))
      submissions.push(request.postDataJSON().plane);
  });
  const fixtureHeaders = { Authorization: "Key test:secret" };
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page
    .getByLabel("Film story", { exact: true })
    .fill(
      "A traveler finds a hidden trail.\nShe follows a warm light between the trees.",
    );
  await page
    .getByRole("button", { name: "Create shot plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate shot", exact: true })
    .click();
  await expect(page.locator(".film-timeline-caption")).toContainText(
    "1 ready",
    { timeout: 40000 },
  );
  await page.getByRole("button", { name: "Edit shot 2", exact: true }).click();
  await page
    .getByLabel("Shot model", { exact: true })
    .selectOption("grok-imagine-video-1.5");
  await page.getByLabel("Shot duration (s)", { exact: true }).fill("4");
  await page
    .getByLabel("Shot continuity", { exact: true })
    .selectOption("frame");
  try {
    await page.request.post("http://127.0.0.1:4319/test/storage", {
      headers: fixtureHeaders,
      data: { mode: "fail" },
    });
    await page
      .getByRole("button", { name: "Generate shot", exact: true })
      .click();
    await expect(page.locator(".film-shot-details [role=alert]")).toContainText(
      "Higgsfield storage rejected",
      { timeout: 20000 },
    );
    await expect(page.locator(".film-shot-details [role=alert]")).toContainText(
      "The next shot was not submitted",
    );
    expect(submissions).toHaveLength(1);
    await expect(page.locator(".film-timeline-caption")).toContainText(
      "1 ready",
    );
    await page.request.post("http://127.0.0.1:4319/test/storage", {
      headers: fixtureHeaders,
      data: { mode: "retry-once" },
    });
    await page
      .getByRole("button", { name: "Generate shot", exact: true })
      .click();
    await expect(page.locator(".film-timeline-caption")).toContainText(
      "2 ready",
      { timeout: 45000 },
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[1]!.model).toBe("grok-imagine-video-1.5");
    const url = submissions[1]!.media.start![0]!.url;
    const stats = await (
      await page.request.get("http://127.0.0.1:4319/test/storage", {
        headers: fixtureHeaders,
      })
    ).json();
    expect(
      stats.slots.find((slot: { publicUrl: string }) => slot.publicUrl === url),
    ).toMatchObject({ attempts: 2, uploaded: true, jpeg: true });
  } finally {
    await page.request.post("http://127.0.0.1:4319/test/storage", {
      headers: fixtureHeaders,
      data: { mode: "retry-once" },
    });
  }
});
