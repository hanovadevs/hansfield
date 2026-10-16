import { defineConfig } from "@playwright/test";
import { encryptionKey, sealCredentials } from "./src/server/credential-vault";

const testSecret = "ab".repeat(32);

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:3011",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
    storageState: {
      cookies: [
        {
          name: "jenera_connection",
          value: sealCredentials("test:secret", encryptionKey(testSecret)),
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  webServer: [
    {
      command: "node tests/mock-platform.mjs",
      url: "http://127.0.0.1:4319/health",
      reuseExistingServer: false,
    },
    {
      command: "node node_modules/next/dist/bin/next dev --port 3011",
      url: "http://localhost:3011",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        HANSFIELD_TEST_MODE: "1",
        HF_API_BASE_URL: "http://127.0.0.1:4319",
        HF_API_KEY: "test:secret",
        JENERA_APP_MODE: "byok",
        SESSION_ENCRYPTION_KEY: testSecret,
        JENERA_DATA_DIR: `artifacts/browser-ledger-${Date.now()}`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
