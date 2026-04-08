import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceDir = join(root, "src", "web");
const targetDir = join(root, "dist", "web");
const docsSourceDir = join(root, "docs");
const docsTargetDir = join(targetDir, "docs");

if (!existsSync(sourceDir)) {
  throw new Error(`Missing web assets directory: ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

if (existsSync(docsSourceDir)) {
  rmSync(docsTargetDir, { recursive: true, force: true });
  mkdirSync(docsTargetDir, { recursive: true });
  cpSync(docsSourceDir, docsTargetDir, { recursive: true });
}
