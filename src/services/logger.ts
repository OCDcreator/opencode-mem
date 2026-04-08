import {
  appendFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

function getLogFilePath(): string {
  return process.env.OPENCODE_MEM_LOG_FILE || join(homedir(), ".opencode-mem", "opencode-mem.log");
}

function getLogDirPath(): string {
  const logFile = getLogFilePath();
  const lastSlash = Math.max(logFile.lastIndexOf("/"), logFile.lastIndexOf("\\"));
  return lastSlash === -1 ? "." : logFile.slice(0, lastSlash);
}

const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_STRING_LENGTH = 2048;
const MAX_LOG_ARRAY_LENGTH = 20;
const MAX_LOG_OBJECT_KEYS = 20;
const MAX_LOG_DEPTH = 4;

const GLOBAL_LOGGER_KEY = Symbol.for("opencode-mem.logger.initialized");

function truncateString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}…[truncated ${value.length - MAX_LOG_STRING_LENGTH} chars]`;
}

function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncateString(value.stack) : undefined,
    };
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (depth >= MAX_LOG_DEPTH) {
    return "[max-depth-reached]";
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LOG_ARRAY_LENGTH)
      .map((item) => sanitizeLogData(item, depth + 1));

    if (value.length > MAX_LOG_ARRAY_LENGTH) {
      items.push(`[truncated ${value.length - MAX_LOG_ARRAY_LENGTH} items]`);
    }

    return items;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries
      .slice(0, MAX_LOG_OBJECT_KEYS)
      .map(([key, entryValue]) => [key, sanitizeLogData(entryValue, depth + 1)]);

    if (entries.length > MAX_LOG_OBJECT_KEYS) {
      limitedEntries.push([
        "__truncatedKeys",
        `[truncated ${entries.length - MAX_LOG_OBJECT_KEYS} keys]`,
      ]);
    }

    return Object.fromEntries(limitedEntries);
  }

  return String(value);
}

function serializeLogData(data: unknown): string {
  try {
    return JSON.stringify(sanitizeLogData(data));
  } catch (error) {
    return JSON.stringify({
      error: "Failed to serialize log payload",
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function rotateLog() {
  const logFile = getLogFilePath();
  try {
    if (!existsSync(logFile)) return;
    const stats = statSync(logFile);
    if (stats.size < MAX_LOG_SIZE) return;

    const oldLog = logFile + ".old";
    if (existsSync(oldLog)) unlinkSync(oldLog);
    renameSync(logFile, oldLog);
  } catch {}
}

function ensureLoggerInitialized() {
  if ((globalThis as any)[GLOBAL_LOGGER_KEY]) return;
  const logDir = getLogDirPath();
  const logFile = getLogFilePath();
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  rotateLog();
  writeFileSync(logFile, `\n--- Session started: ${new Date().toISOString()} ---\n`, {
    flag: "a",
  });
  (globalThis as any)[GLOBAL_LOGGER_KEY] = true;
}

export function log(message: string, data?: unknown) {
  ensureLoggerInitialized();
  const logFile = getLogFilePath();
  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] ${message}: ${serializeLogData(data)}\n`
    : `[${timestamp}] ${message}\n`;
  appendFileSync(logFile, line);
}
