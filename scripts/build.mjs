import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { prepareStandalone } from "./prepare-standalone.mjs";

const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "build",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", windowsHide: true },
);
const code = await new Promise((done, fail) => {
  child.on("error", fail);
  child.on("exit", done);
});
if (code !== 0) process.exit(code ?? 1);
if (process.env.VERCEL !== "1") await prepareStandalone();
