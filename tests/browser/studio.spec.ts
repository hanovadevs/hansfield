import { test, expect } from "./fixtures";
import { readFile } from "node:fs/promises";

test("studio renders without errors and keeps native creative settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make it move." }),
  ).toBeVisible();
  await expect(page.getByLabel("Generation model")).toHaveValue("cinema-4");
  await page.getByRole("button", { name: /The quiet epic/ }).click();
  await expect(page.getByLabel("Describe your scene")).toHaveValue(
    /A lone traveler/,
  );
  await page.getByText("Creative controls", { exact: true }).click();
  await expect(page.getByLabel("Camera movement")).toHaveValue(
    "aerial-pullback",
  );
  await expect(page.getByLabel("Camera lens")).toHaveValue("anamorphic");
  await page.getByRole("button", { name: "Add to film", exact: true }).click();
  await expect(page.locator(".studio-shot")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".studio-shot")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Advanced direction", exact: true })
    .click();
  await page.getByText("Creative controls", { exact: true }).click();
  await expect(page.getByLabel("Camera movement")).toHaveValue(
    "aerial-pullback",
  );
  expect(errors).toEqual([]);
});

test("shot board exports, reorders, restores and imports complete scene controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /The quiet epic/ }).click();
  await page.getByRole("button", { name: "Add to film", exact: true }).click();
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await page.getByRole("button", { name: /After hours/ }).click();
  await page.getByRole("button", { name: "Add to film", exact: true }).click();
  await page.getByLabel("Film title").fill("Two scenes");
  await page.getByRole("button", { name: "Move shot 2 left" }).click();
  await expect(page.locator(".studio-shot").first()).toContainText("A woman");
  await page.locator(".studio-shot-load").last().click();
  await expect(page.getByLabel("Describe your scene")).toHaveValue(
    /A lone traveler/,
  );
  await page.getByText("Creative controls", { exact: true }).click();
  await expect(page.getByLabel("Camera lens")).toHaveValue("anamorphic");
  await page
    .getByRole("button", { name: "Close shot direction", exact: true })
    .last()
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export board" }).click();
  const file = await download;
  const data = await readFile((await file.path())!);
  expect(JSON.parse(data.toString()).shots).toHaveLength(2);
  await page.getByRole("button", { name: "Remove shot 2" }).click();
  await page.getByRole("button", { name: "Remove shot 1" }).click();
  await page
    .locator('.studio-board input[type="file"][accept=".json"]')
    .setInputFiles({
      name: "two-scenes.hansfield.json",
      mimeType: "application/json",
      buffer: data,
    });
  await expect(page.locator(".studio-shot")).toHaveCount(2);
  await expect(page.getByLabel("Film title")).toHaveValue("Two scenes");
  await page.reload();
  await expect(page.locator(".studio-shot").first()).toContainText("A woman");
});

test("an accepted submission with a lost response resumes using the original request identity", async ({
  page,
}) => {
  const identities: string[] = [];
  const accepted: string[] = [];
  let loseResponse = true;
  await page.route("**/api/generations", async (route) => {
    identities.push(route.request().postDataJSON().idempotencyKey);
    const response = await route.fetch();
    accepted.push((await response.json()).requestId);
    if (loseResponse) {
      loseResponse = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await page.goto("/");
  await page
    .getByLabel("Describe your scene")
    .fill("A sunlit desert and a slow aerial camera.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume submission" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Resume submission" }).click();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  expect(identities).toHaveLength(1);
  expect(accepted[0]).toBeTruthy();
  await expect(page.locator(".ohf-tile--interrupted")).toHaveCount(0);
});

test("video flows through API, provider status, preview, download and persisted history", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Describe your scene")
    .fill("A static wide shot of a misty forest at dawn.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.getByText("In the making", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  await expect(page.locator(".studio-viewfinder video")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".studio-viewfinder video")
        .evaluate((el) => (el as HTMLVideoElement).readyState),
    )
    .toBeGreaterThan(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download latest creation" }).click();
  expect((await download).suggestedFilename()).toMatch(/^jenera-.*\.mp4$/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Open run — Cinema Studio/ }),
  ).toBeVisible();
});

test("refresh resumes an accepted queued job and cancellation reaches the provider", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Describe your scene")
    .fill("[queued] A quiet dawn scene.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel queued job" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Cancel queued job" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel queued job" }).click();
  await expect(page.getByText("Canceled", { exact: true })).toBeVisible();
  await expect(page.locator(".studio-job")).toHaveCount(0);
});

test("transient per-job status failures recover without losing the request", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Describe your scene")
    .fill("[transient] A calm lake in golden sunlight.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  await expect(page.locator(".ohf-tile--failed")).toHaveCount(0);
});

test("required references are actionable and blocked before generation", async ({
  page,
}) => {
  let submissions = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/generations")) submissions++;
  });
  await page.goto("/");
  await page.getByLabel("Generation model").selectOption("genjutsu");
  await page
    .getByLabel("Describe your scene")
    .fill("Transfer this motion to my character.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.locator(".studio-error")).toContainText("Add a video");
  expect(submissions).toBe(0);
  await page
    .getByRole("button", { name: "Add frames, files or past creations" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reference library" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Reference library" }),
  ).toHaveCount(0);
});

test("reference uploads reject the wrong media kind and condition the actual generation", async ({
  page,
}) => {
  let uploadCount = 0;
  let submitted: Record<string, unknown> | undefined;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR3sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://cdn.example.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.route("**/api/upload", (route) => {
    uploadCount++;
    return route.fulfill({
      json: { url: "https://cdn.example.com/reference.png" },
    });
  });
  page.on("request", (req) => {
    if (req.url().endsWith("/api/generations")) submitted = req.postDataJSON();
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add frames, files or past creations" })
    .click();
  const input = page.locator('.studio-composer input[type="file"]');
  await page.getByRole("button", { name: "Upload file", exact: true }).click();
  await input.setInputFiles({
    name: "wrong.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fake video"),
  });
  await expect(page.locator(".studio-error")).toContainText("image file");
  expect(uploadCount).toBe(0);
  await input.setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page
    .getByRole("button", { name: "Add reference", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove reference", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Describe your scene")
    .fill("A calm scene guided by my reference.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  expect(uploadCount).toBe(1);
  expect(submitted?.plane).toMatchObject({
    media: { reference: [{ url: "https://cdn.example.com/reference.png" }] },
  });
  await page.locator(".ohf-tile").hover();
  await page.getByRole("checkbox", { name: /Select run/ }).click();
  const bulk = page.getByRole("group", { name: "Bulk actions" });
  await expect(bulk).toBeVisible();
  await bulk
    .getByRole("button", { name: "Save to favorites", exact: true })
    .click();
  await bulk.getByRole("button", { name: "Clear selection" }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(page.locator(".ohf-tile")).toHaveCount(1);
});

test("failed submissions remain reviewable and the prompt survives", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Describe your scene")
    .fill("[reject] A scene the provider rejects.");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect(page.locator(".studio-error")).toContainText(
    "Test input rejected",
  );
  await expect(page.locator(".ohf-tile--failed")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit inputs" }).click();
  await expect(page.getByLabel("Describe your scene")).toHaveValue(
    "[reject] A scene the provider rejects.",
  );
});

test("image generation can be saved to favorites, deleted and restored", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Image studio", exact: true }).click();
  await page
    .getByLabel("Describe your image")
    .fill("A ceramic vase on a warm stone shelf.");
  await page
    .getByRole("button", { name: "Generate image", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Inspect latest creation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect latest creation" }).click();
  await page
    .getByRole("button", { name: "Save to favorites", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(page.locator(".ohf-tile")).toHaveCount(1);
  await page.locator(".ohf-tile").hover();
  await page.getByRole("button", { name: /Delete run —/ }).click();
  await expect(page.locator(".ohf-tile")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".ohf-tile")).toHaveCount(1);
});

test("mobile layout has reachable generation controls and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /After hours/ }).click();
  await expect(page.getByLabel("Describe your scene")).toBeFocused();
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Generate video", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("API boundaries reject bad origins, invalid payloads and unsupported uploads", async ({
  request,
}) => {
  const origin = await request.post("/api/generations", {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  });
  expect(origin.status()).toBe(403);
  const invalid = await request.post("/api/generations", {
    data: { plane: {}, idempotencyKey: "valid-intent" },
  });
  expect(invalid.status()).toBe(400);
  const upload = await request.post("/api/upload", {
    multipart: {
      file: {
        name: "bad.html",
        mimeType: "text/html",
        buffer: Buffer.from("hello"),
      },
    },
  });
  expect(upload.status()).toBe(400);
  expect((await upload.json()).error).toContain("Upload a JPG");
});
