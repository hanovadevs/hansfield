// Read credentials only inside the local, opted-in verification process.
// No browser storage-state file or credential-bearing trace is written.
export async function connectPreview(page, baseURL) {
  const target = new URL(baseURL);
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.protocol !== "https:"
  )
    throw new Error("Provider credentials require HTTPS outside localhost.");
  if (
    await page
      .getByRole("button", { name: "Higgsfield connected", exact: true })
      .isVisible()
  )
    return;
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const apiKey =
    process.env.HF_API_KEY || process.env.HF_CREDENTIALS || process.env.HF_KEY;
  if (!apiKey)
    throw new Error(
      "Set your Higgsfield API key locally for this verification.",
    );
  await page
    .getByRole("button", { name: "Connect Higgsfield", exact: true })
    .click();
  await page.getByLabel("API key", { exact: true }).fill(apiKey);
  await page
    .getByRole("button", { name: "Connect account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Higgsfield connected", exact: true })
    .waitFor({ timeout: 25000 });
}
