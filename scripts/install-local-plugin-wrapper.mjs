#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configDir =
  process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode");
const pluginDir = join(configDir, "plugins");
const wrapperPath = join(pluginDir, "opencode-mem.js");
const pluginPackagePath = join(pluginDir, "package.json");
const entryPath = join(repoRoot, "dist", "index.js").replaceAll("\\", "/");
const configPath = join(configDir, "opencode.json");
const runtimeDirs = [join(repoRoot, "dist", "services")];

function renderWrapper() {
  return `import { pathToFileURL } from "node:url";

const id = "opencode-mem";
const entryUrl = pathToFileURL(
  "${entryPath}"
).href;

async function OpenCodeMemPlugin(...args) {
  const mod = await import(entryUrl);
  return mod.OpenCodeMemPlugin(...args);
}

export { id, OpenCodeMemPlugin };
export const server = OpenCodeMemPlugin;
export default {
  id,
  server: OpenCodeMemPlugin,
};
`;
}

function renderPluginPackage() {
  return `${JSON.stringify({ type: "module" }, null, 2)}\n`;
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function hasNpmPluginEntry() {
  if (!existsSync(configPath)) {
    return false;
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  return Array.isArray(config.plugin) && config.plugin.includes("opencode-mem");
}

function listJavaScriptFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listJavaScriptFiles(path));
    } else if (entry.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function findRuntimeRequireCalls() {
  const offenders = [];
  for (const dir of runtimeDirs) {
    for (const path of listJavaScriptFiles(dir)) {
      if (/\brequire\s*\(/.test(readFileSync(path, "utf-8"))) {
        offenders.push(path);
      }
    }
  }
  return offenders;
}

async function verifyNodeRuntimeCanOpenSqlite() {
  const sqliteBootstrapUrl = `${pathToFileURL(
    join(repoRoot, "dist", "services", "sqlite", "sqlite-bootstrap.js")
  ).href}?check=${Date.now()}`;
  const mod = await import(sqliteBootstrapUrl);
  const Database = mod.getDatabase();
  const db = new Database(":memory:");
  try {
    db.run("CREATE TABLE smoke (id INTEGER PRIMARY KEY, value TEXT)");
    db.run("INSERT INTO smoke (value) VALUES (?)", ["ok"]);
    const row = db.prepare("SELECT value FROM smoke WHERE id = ?").get(1);
    if (!row || row.value !== "ok") {
      throw new Error("sqlite smoke query returned an unexpected result");
    }
  } finally {
    db.close();
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const expected = renderWrapper();
const expectedPluginPackage = renderPluginPackage();

if (checkOnly) {
  if (!existsSync(entryPath)) {
    fail(`Missing built entry: ${entryPath}`);
  }

  if (readText(pluginPackagePath) !== expectedPluginPackage) {
    fail(`Local plugin package marker is out of date: ${pluginPackagePath}`);
  }

  if (readText(wrapperPath) !== expected) {
    fail(`Local wrapper is out of date: ${wrapperPath}`);
  }

  if (hasNpmPluginEntry()) {
    fail('Remove "opencode-mem" from the opencode.json plugin array.');
  }

  const runtimeRequireOffenders = findRuntimeRequireCalls();
  if (runtimeRequireOffenders.length > 0) {
    fail(
      `Built runtime contains CommonJS require() calls that break Desktop ESM loading:\n${runtimeRequireOffenders.join("\n")}`
    );
  }

  try {
    await verifyNodeRuntimeCanOpenSqlite();
  } catch (error) {
    fail(`Built runtime cannot open SQLite under the Desktop Node runtime: ${String(error)}`);
  }

  if (process.exitCode) {
    process.exit();
  }

  console.log(`Local wrapper OK: ${wrapperPath}`);
  process.exit();
}

mkdirSync(dirname(wrapperPath), { recursive: true });
writeFileSync(pluginPackagePath, expectedPluginPackage, "utf-8");
writeFileSync(wrapperPath, expected, "utf-8");
console.log(`Wrote local wrapper: ${wrapperPath}`);

if (hasNpmPluginEntry()) {
  console.warn('Warning: remove "opencode-mem" from the opencode.json plugin array.');
}
