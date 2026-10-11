import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { preflight } from "./preflight.mjs";
import { prepareStandalone } from "./prepare-standalone.mjs";

process.env.NODE_ENV = "production";
for (const file of [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await preflight();
await prepareStandalone();
const portFlag = process.argv.findIndex(
  (value) => value === "--port" || value === "-p",
);
if (portFlag >= 0) process.env.PORT = process.argv[portFlag + 1];
process.env.HOSTNAME ||= "0.0.0.0";
const child = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
  stdio: "inherit",
  windowsHide: true,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
