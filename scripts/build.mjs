import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceDir = join(root, "src", "web");
const targetDir = join(root, "dist", "web");

if (!existsSync(sourceDir)) {
  throw new Error(`Missing web assets directory: ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
