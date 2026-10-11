import { spawn } from "node:child_process";
import { preflight } from "./preflight.mjs";

await preflight();
const child = spawn(process.execPath, ["server.js"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
