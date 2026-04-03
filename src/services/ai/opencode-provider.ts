import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import { stripJsoncComments } from "../jsonc.js";
import { log } from "../logger.js";
export {
  getConfigPath,
  getStatePath,
  isProviderConnected,
  setConnectedProviders,
  setConfigPath,
  setStatePath,
} from "./opencode-state.js";
import { getConfigPath } from "./opencode-state.js";

interface OpencodeProviderConfig {
  npm?: string;
  env?: string[];
  options?: {
    apiKey?: string;
    baseURL?: string;
    baseUrl?: string;
    [key: string]: unknown;
  };
  models?: Record<string, unknown>;
  [key: string]: unknown;
}

interface OpencodeConfigFile {
  provider?: Record<string, OpencodeProviderConfig>;
}

function configCandidates(basePath?: string | null): string[] {
  if (!basePath) return [];
  return [
    basePath,
    join(basePath, "config.json"),
    join(basePath, "opencode.json"),
    join(basePath, "opencode.jsonc"),
  ];
}

function findOpencodeConfigPath(statePath?: string): string | undefined {
  const candidates = [
    ...configCandidates(getConfigPath()),
    ...configCandidates(statePath),
    ...(statePath ? configCandidates(dirname(statePath)) : []),
    ...configCandidates(join(homedir(), ".config", "opencode")),
  ];

  const seen = new Set<string>();

  return candidates.find((candidate) => {
    if (!candidate || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function resolveFileReference(filePath: string, baseDir: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("File reference is empty");
  }

  if (trimmed.startsWith("~/")) {
    return join(homedir(), trimmed.slice(2));
  }

  if (trimmed.startsWith("file://")) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return trimmed.slice("file://".length);
    }
  }

  if (isAbsolute(trimmed)) {
    return trimmed;
  }

  return resolve(baseDir, trimmed);
}

function resolveConfigString(value: string, baseDir: string): string {
  let result = value.replace(/\{env:([^}]+)\}/g, (_match, envName) => {
    return process.env[String(envName)] ?? "";
  });

  result = result.replace(/\{file:([^}]+)\}/g, (_match, filePath) => {
    const resolvedPath = resolveFileReference(String(filePath), baseDir);
    return readFileSync(resolvedPath, "utf-8").trim();
  });

  if (result.startsWith("env://")) {
    return process.env[result.slice("env://".length)] ?? "";
  }

  if (result.startsWith("file://")) {
    const resolvedPath = resolveFileReference(result, baseDir);
    return readFileSync(resolvedPath, "utf-8").trim();
  }

  return result;
}

function resolveConfigValue(value: unknown, baseDir: string): unknown {
  if (typeof value === "string") {
    return resolveConfigString(value, baseDir);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveConfigValue(item, baseDir));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, resolveConfigValue(nested, baseDir)])
  );
}

function loadOpencodeConfig(statePath?: string): OpencodeConfigFile {
  const configPath = findOpencodeConfigPath(statePath);
  if (!configPath) {
    throw new Error(`opencode config not found near ${statePath ?? "default config directories"}`);
  }

  try {
    log("OpencodeProvider: loading config", {
      statePath: statePath ?? null,
      configPath,
    });
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(stripJsoncComments(raw)) as OpencodeConfigFile;
    return resolveConfigValue(parsed, dirname(configPath)) as OpencodeConfigFile;
  } catch (error) {
    throw new Error(`Failed to read opencode config at ${configPath}: ${String(error)}`);
  }
}

function getProviderConfig(
  statePath: string | undefined,
  providerName: string
): OpencodeProviderConfig {
  const config = loadOpencodeConfig(statePath);
  const provider = config.provider?.[providerName];

  if (!provider) {
    const available = Object.keys(config.provider ?? {}).join(", ") || "none";
    throw new Error(
      `Provider '${providerName}' not found in opencode config. Available providers: ${available}`
    );
  }

  return provider;
}

function getBaseUrl(provider: OpencodeProviderConfig): string {
  const baseUrl = provider.options?.baseURL ?? provider.options?.baseUrl;
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error("Provider baseURL is missing in opencode config");
  }
  return baseUrl.replace(/\/+$/, "");
}

function getApiKey(provider: OpencodeProviderConfig): string | undefined {
  const apiKey = provider.options?.apiKey;
  if (typeof apiKey === "string" && apiKey.trim()) {
    return apiKey;
  }

  for (const envName of provider.env ?? []) {
    const candidate = process.env[envName];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function inferProviderKind(
  providerName: string,
  provider: OpencodeProviderConfig
): "anthropic" | "openai-compatible" {
  const npmName = String(provider.npm ?? "").toLowerCase();
  const name = providerName.toLowerCase();

  if (npmName.includes("anthropic") || name.includes("anthropic")) {
    return "anthropic";
  }

  return "openai-compatible";
}

function extractJsonString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Model returned empty content");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("Could not extract JSON object from model response");
}

async function callOpenAICompatible<T>(options: {
  provider: OpencodeProviderConfig;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const url = `${getBaseUrl(options.provider)}/chat/completions`;
  log("OpencodeProvider: call openai-compatible", {
    modelId: options.modelId,
    url,
    hasApiKey: !!getApiKey(options.provider),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getApiKey(options.provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const instructions =
    `${options.systemPrompt}\n\n` +
    "Return ONLY a valid JSON object that matches the requested structure. Do not use markdown fences.";

  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: options.userPrompt },
    ],
    response_format: { type: "json_object" },
  };

  if (options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

  let response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok && response.status === 400) {
    const fallbackBody = { ...requestBody };
    delete fallbackBody.response_format;
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(fallbackBody),
    });
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Provider request failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Provider returned no text content");
  }

  log("callOpenAICompatible raw content", { content: content.slice(0, 500) });
  let parsed = JSON.parse(extractJsonString(content));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed);
    const firstKey = keys[0];
    if (
      keys.length === 1 &&
      firstKey &&
      typeof parsed[firstKey] === "object" &&
      parsed[firstKey] !== null
    ) {
      parsed = parsed[firstKey];
    }
  }
  log("callOpenAICompatible parsed JSON", parsed);
  return options.schema.parse(parsed);
}

async function callAnthropic<T>(options: {
  provider: OpencodeProviderConfig;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const url = `${getBaseUrl(options.provider)}/messages`;
  log("OpencodeProvider: call anthropic-compatible", {
    modelId: options.modelId,
    url,
    hasApiKey: !!getApiKey(options.provider),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  const apiKey = getApiKey(options.provider);
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const requestBody: Record<string, unknown> = {
    model: options.modelId,
    max_tokens: 4096,
    system:
      `${options.systemPrompt}\n\n` +
      "Return ONLY a valid JSON object that matches the requested structure. Do not use markdown fences.",
    messages: [{ role: "user", content: options.userPrompt }],
  };

  if (options.temperature !== undefined) {
    requestBody.temperature = options.temperature;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`Provider request failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as any;
  const content = Array.isArray(data?.content)
    ? data.content
        .filter((block: any) => block?.type === "text" && typeof block.text === "string")
        .map((block: any) => block.text)
        .join("\n")
    : "";

  if (!content) {
    throw new Error("Provider returned no text content");
  }

  return options.schema.parse(JSON.parse(extractJsonString(content)));
}

export async function generateStructuredOutput<T>(options: {
  providerName: string;
  modelId: string;
  statePath?: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const provider = getProviderConfig(options.statePath, options.providerName);
  const providerKind = inferProviderKind(options.providerName, provider);
  log("OpencodeProvider: generate structured output", {
    providerName: options.providerName,
    modelId: options.modelId,
    providerKind,
    statePath: options.statePath ?? null,
    configPath: getConfigPath(),
    hasApiKey: !!getApiKey(provider),
    hasBaseUrl: !!provider.options?.baseURL || !!provider.options?.baseUrl,
  });

  try {
    if (providerKind === "anthropic") {
      return await callAnthropic({ ...options, provider });
    }

    return await callOpenAICompatible({ ...options, provider });
  } catch (error) {
    log("generateStructuredOutput failed", {
      providerName: options.providerName,
      modelId: options.modelId,
      error: String(error),
    });
    throw error;
  }
}
