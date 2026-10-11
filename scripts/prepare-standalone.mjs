import {
  cp,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  unlink,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";

export async function prepareStandalone() {
  const root = resolve(".next/standalone");
  // Next's traced pnpm directory links can be emitted as file symlinks on
  // Windows, causing EPERM when Node resolves React. Repair generated copies
  // as directory junctions; never traverse or modify the source node_modules.
  if (process.platform === "win32") {
    async function repair(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name);
        if (entry.isSymbolicLink()) {
          const target = resolve(dirname(file), await readlink(file));
          const rel = relative(root, target);
          if (!rel || rel.startsWith("..") || isAbsolute(rel))
            throw new Error("Standalone link points outside the package.");
          if ((await stat(target)).isDirectory()) {
            await unlink(file);
            await symlink(target, file, "junction");
          }
        } else if (entry.isDirectory()) await repair(file);
      }
    }
    await repair(resolve(root, "node_modules"));
  }
  // Next may copy dotenv files into standalone output. Only remove generated
  // deployment copies, never the workspace's environment files or artifacts.
  for (const entry of await readdir(root)) {
    if (!entry.startsWith(".env") && !["artifacts", "tests"].includes(entry))
      continue;
    const target = resolve(root, entry);
    const rel = relative(root, target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel))
      throw new Error("Unsafe standalone cleanup target.");
    await rm(target, { recursive: true, force: true });
  }
  await cp(resolve("public"), resolve(root, "public"), { recursive: true });
  await cp(resolve(".next/static"), resolve(root, ".next/static"), {
    recursive: true,
  });
  console.log(
    "Standalone assets prepared; local environment and verification artifacts excluded.",
  );
}
