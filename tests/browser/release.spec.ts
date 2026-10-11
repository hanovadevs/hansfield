import { test, expect } from "@playwright/test";

test("public BYOK never exposes or uses the environment key for an anonymous visitor", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Jenera home" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Higgsfield", exact: true }),
  ).toBeVisible();
  for (const url of [
    "/api/generations",
    "/api/generations/status",
    "/api/generations/cancel",
    "/api/film/process",
  ])
    expect((await context.request.post(url, { data: {} })).status()).toBe(401);
  expect(
    (await context.request.post("/api/upload", { multipart: {} })).status(),
  ).toBe(401);
  expect(await page.content()).not.toContain("test:secret");
});

test("verified customer connections are encrypted, isolated, and disconnected without deleting projects", async ({
  page,
  context,
  browser,
}) => {
  await context.clearCookies();
  await page.goto("/?workspace=films");
  await page.getByRole("button", { name: "+ New film", exact: true }).click();
  await page.getByLabel("Film title").fill("My private cut");
  await page
    .getByRole("button", { name: "Connect Higgsfield", exact: true })
    .click();
  await page.getByLabel("API key", { exact: true }).fill("invalid:key");
  await page
    .getByRole("button", { name: "Connect account", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Connect to Higgsfield" })
      .getByRole("alert"),
  ).toContainText("Higgsfield rejected");
  await page.getByLabel("API key", { exact: true }).fill("customer:second");
  await page
    .getByRole("button", { name: "Connect account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Higgsfield connected", exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "jenera_connection",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Lax");
  expect(cookie.value).toMatch(/^v1\./);
  expect(cookie.value).not.toContain("customer:second");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "jenera_connection",
  );
  const other = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const stranger = await other.newPage();
    await stranger.goto("http://localhost:3011/");
    await expect(
      stranger.getByRole("button", { name: "Connect Higgsfield", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
  await page
    .getByRole("button", { name: "Higgsfield connected", exact: true })
    .click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Film title")).toHaveValue("My private cut");
  await expect(
    page.getByRole("button", { name: "Connect Higgsfield", exact: true }),
  ).toBeVisible();
});

test("one API account cannot query or cancel another account's generated job", async ({
  context,
  browser,
}) => {
  const result = await context.request.post("/api/generations", {
    data: {
      idempotencyKey: crypto.randomUUID(),
      plane: {
        model: "cinema-4",
        prompt: { text: "A quiet scene." },
        media: {},
        settings: {},
      },
    },
  });
  expect(result.ok()).toBe(true);
  const { requestId } = await result.json();
  const other = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await other.newPage();
    await page.goto("http://localhost:3011/");
    await page
      .getByRole("button", { name: "Connect Higgsfield", exact: true })
      .click();
    await page.getByLabel("API key", { exact: true }).fill("customer:second");
    await page
      .getByRole("button", { name: "Connect account", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Higgsfield connected", exact: true }),
    ).toBeVisible();
    const response = await other.request.post(
      "http://localhost:3011/api/generations/status",
      { data: { requests: [{ requestId }] } },
    );
    expect((await response.json())[0].error).toBe("Not found");
    expect(
      (
        await other.request.post(
          "http://localhost:3011/api/generations/cancel",
          { data: { requestId } },
        )
      ).status(),
    ).toBe(404);
  } finally {
    await other.close();
  }
});

test("release metadata, icons, help, privacy and native health are coherent", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Jenera — Film Studio");
  expect((await request.get("/api/health")).status()).toBe(200);
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("Jenera");
  for (const icon of manifest.icons)
    expect((await request.get(icon.src)).ok()).toBe(true);
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "Your first film, step by step." }),
  ).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Where your work lives." }),
  ).toBeVisible();
});
