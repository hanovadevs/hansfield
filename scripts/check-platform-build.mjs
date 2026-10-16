import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const child = spawn(process.execPath, ["scripts/build.mjs"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    VERCEL: "1",
    HANSFIELD_TEST_MODE: "0",
    NEXT_ADAPTER_PATH: resolve("tests/fixtures/build-adapter.mjs"),
  },
});
const code = await new Promise((done, fail) => {
  child.on("error", fail);
  child.on("exit", done);
});
if (code !== 0) process.exit(code ?? 1);
assert.deepEqual(
  JSON.parse(await readFile(".next/adapter-regression.json", "utf8")),
  { passed: true },
);
assert.equal(
  await stat(".next/standalone").then(
    () => true,
    () => false,
  ),
  false,
);
console.log("Platform adapter build passed; standalone packaging was skipped.");
