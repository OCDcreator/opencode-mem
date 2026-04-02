import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ZodType } from "zod";
import { stripJsoncComments } from "../jsonc.js";
import { log } from "../logger.js";
export {
  getStatePath,
  isProviderConnected,
  setConnectedProviders,
  setStatePath,
} from "./opencode-state.js";

interface OpencodeProviderConfig {
  npm?: string;
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

function findOpencodeConfigPath(statePath: string): string | undefined {
  const candidates = [
    statePath,
    join(statePath, "opencode.json"),
    join(statePath, "opencode.jsonc"),
    join(dirname(statePath), "opencode.json"),
    join(dirname(statePath), "opencode.jsonc"),
    join(homedir(), ".config", "opencode", "opencode.json"),
    join(homedir(), ".config", "opencode", "opencode.jsonc"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function loadOpencodeConfig(statePath: string): OpencodeConfigFile {
  const configPath = findOpencodeConfigPath(statePath);
  if (!configPath) {
    throw new Error(`opencode config not found near ${statePath}`);
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(stripJsoncComments(raw)) as OpencodeConfigFile;
  } catch (error) {
    throw new Error(`Failed to read opencode config at ${configPath}: ${String(error)}`);
  }
}

function getProviderConfig(statePath: string, providerName: string): OpencodeProviderConfig {
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
  return typeof apiKey === "string" && apiKey.trim() ? apiKey : undefined;
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

  return options.schema.parse(JSON.parse(extractJsonString(content)));
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
  statePath: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const provider = getProviderConfig(options.statePath, options.providerName);
  const providerKind = inferProviderKind(options.providerName, provider);

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
