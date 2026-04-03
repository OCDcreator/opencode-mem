import type { PluginInput } from "@opencode-ai/plugin";
import { memoryClient } from "./client.js";
import { getTags } from "./tags.js";
import { log } from "./logger.js";
import { CONFIG } from "../config.js";
import { userPromptManager } from "./user-prompt/user-prompt-manager.js";

interface ToolCallInfo {
  name: string;
  input: string;
}

const MAX_TOOL_INPUT_LENGTH = 100;

const runningSessions = new Set<string>();

export type AutoCaptureResult = "captured" | "skipped" | "retry" | "none" | "busy";

export async function performAutoCapture(
  ctx: PluginInput,
  sessionID: string,
  directory: string
): Promise<AutoCaptureResult> {
  if (runningSessions.has(sessionID)) {
    log("AutoCapture: session already running", { sessionID });
    return "busy";
  }

  runningSessions.add(sessionID);
  let claimedPromptId: string | null = null;
  let claimedPromptHandled = false;
  let result: AutoCaptureResult = "retry";
  try {
    log("AutoCapture: starting", { sessionID });
    const prompt = userPromptManager.getLastUncapturedPrompt(sessionID);
    if (!prompt) {
      log("AutoCapture: no uncaptured prompt found", { sessionID });
      result = "none";
      return "none";
    }

    if (!userPromptManager.claimPrompt(prompt.id)) {
      log("AutoCapture: claim failed", { promptId: prompt.id });
      result = "retry";
      return "retry";
    }
    claimedPromptId = prompt.id;
    log("AutoCapture: prompt claimed", {
      promptId: prompt.id,
      content: prompt.content?.slice(0, 80),
    });

    if (!ctx.client) {
      log("AutoCapture: no client available");
      throw new Error("Client not available");
    }

    log("AutoCapture: fetching messages", { sessionID });
    const response = await ctx.client.session.messages({
      path: { id: sessionID },
    });

    if (!response.data) {
      log("AutoCapture: no response data from messages API");
      result = "retry";
      return "retry";
    }

    const messages = response.data;
    log("AutoCapture: messages received", { count: messages.length });

    const promptIndex = messages.findIndex((m: any) => m.info?.id === prompt.messageId);
    if (promptIndex === -1) {
      log("AutoCapture: prompt message not found in history", {
        promptMessageId: prompt.messageId,
        messageIds: messages.map((m: any) => m.info?.id),
      });
      result = "retry";
      return "retry";
    }

    const aiMessages = messages.slice(promptIndex + 1);

    if (aiMessages.length === 0) {
      log("AutoCapture: no AI messages after prompt");
      result = "retry";
      return "retry";
    }

    const { textResponses, toolCalls } = extractAIContent(aiMessages);
    log("AutoCapture: extracted content", {
      textCount: textResponses.length,
      toolCount: toolCalls.length,
    });

    if (textResponses.length === 0 && toolCalls.length === 0) {
      log("AutoCapture: no usable content extracted");
      result = "retry";
      return "retry";
    }

    const tags = getTags(directory);
    const latestMemory = await getLatestProjectMemory(tags.project.tag);

    const context = buildMarkdownContext(prompt.content, textResponses, toolCalls, latestMemory);

    log("AutoCapture: generating summary");
    const summaryResult = await generateSummary(context, sessionID, prompt.content);

    if (!summaryResult || summaryResult.type === "skip") {
      log("AutoCapture: summary skipped", { summaryResult });
      userPromptManager.deletePrompt(prompt.id);
      claimedPromptHandled = true;
      result = "skipped";
      return "skipped";
    }
    log("AutoCapture: summary generated", { type: summaryResult.type, tags: summaryResult.tags });

    const memoryResult = await memoryClient.addMemory(summaryResult.summary, tags.project.tag, {
      source: "auto-capture" as any,
      type: summaryResult.type as any,
      tags: summaryResult.tags,
      sessionID,
      promptId: prompt.id,
      captureTimestamp: Date.now(),
      displayName: tags.project.displayName,
      userName: tags.project.userName,
      userEmail: tags.project.userEmail,
      projectPath: tags.project.projectPath,
      projectName: tags.project.projectName,
      gitRepoUrl: tags.project.gitRepoUrl,
    });

    if (memoryResult.success) {
      userPromptManager.linkMemoryToPrompt(prompt.id, memoryResult.id);
      userPromptManager.markAsCaptured(prompt.id);
      claimedPromptHandled = true;
      result = "captured";
      log("AutoCapture: memory stored", {
        promptId: prompt.id,
        memoryId: memoryResult.id,
        sessionID,
      });

      if (CONFIG.showAutoCaptureToasts) {
        await ctx.client?.tui
          .showToast({
            body: {
              title: "Memory Captured",
              message: "Project memory saved from conversation",
              variant: "success",
              duration: 3000,
            },
          })
          .catch(() => {});
      }

      return "captured";
    }

    log("AutoCapture: memory store failed", {
      promptId: prompt.id,
      sessionID,
      memoryResult,
    });
    result = "retry";
    return "retry";
  } catch (error) {
    log("AutoCapture: ERROR", { error: String(error), stack: (error as any)?.stack });
    result = "retry";
  } finally {
    if (claimedPromptId && !claimedPromptHandled) {
      userPromptManager.releasePrompt(claimedPromptId);
      log("AutoCapture: prompt released for retry", { promptId: claimedPromptId });
    }
    log("AutoCapture: finished", {
      sessionID,
      result,
      claimedPromptId,
      claimedPromptHandled,
    });
    runningSessions.delete(sessionID);
  }

  return result;
}

function extractAIContent(messages: any[]): {
  textResponses: string[];
  toolCalls: ToolCallInfo[];
} {
  const textResponses: string[] = [];
  const toolCalls: ToolCallInfo[] = [];

  for (const msg of messages) {
    if (msg.info?.role !== "assistant") continue;

    if (!msg.parts || !Array.isArray(msg.parts)) continue;

    const textParts = msg.parts.filter((p: any) => p.type === "text" && p.text);
    if (textParts.length > 0) {
      const text = textParts.map((p: any) => p.text).join("\n");
      if (text.trim()) {
        textResponses.push(text.trim());
      }
    }

    const toolParts = msg.parts.filter((p: any) => p.type === "tool");
    for (const tool of toolParts) {
      const name = tool.tool || "unknown";
      let input = "";

      if (tool.state?.input) {
        const inputObj = tool.state.input;
        if (typeof inputObj === "string") {
          input = inputObj;
        } else if (typeof inputObj === "object") {
          const params = [];
          for (const [key, value] of Object.entries(inputObj)) {
            params.push(`${key}: ${JSON.stringify(value)}`);
          }
          input = params.join(", ");
        }
      }

      if (input.length > MAX_TOOL_INPUT_LENGTH) {
        input = input.substring(0, MAX_TOOL_INPUT_LENGTH) + "...";
      }

      toolCalls.push({ name, input });
    }
  }

  return { textResponses, toolCalls };
}

async function getLatestProjectMemory(containerTag: string): Promise<string | null> {
  try {
    const result = await memoryClient.listMemories(containerTag, 1);
    if (!result.success || result.memories.length === 0) {
      return null;
    }

    const latest = result.memories[0];
    if (!latest) {
      return null;
    }

    const content = latest.summary;

    if (content.length <= 500) {
      return content;
    }

    return content.substring(0, 500) + "...";
  } catch {
    return null;
  }
}

function buildMarkdownContext(
  userPrompt: string,
  textResponses: string[],
  toolCalls: ToolCallInfo[],
  latestMemory: string | null
): string {
  const sections: string[] = [];

  if (latestMemory) {
    sections.push(`## Previous Memory Context`);
    sections.push(`---`);
    sections.push(latestMemory);
    sections.push(`---\n`);
  }

  sections.push(`## User Request`);
  sections.push(`---`);
  sections.push(userPrompt);
  sections.push(`---\n`);

  if (textResponses.length > 0) {
    sections.push(`## AI Response`);
    sections.push(`---`);
    sections.push(textResponses.join("\n\n"));
    sections.push(`---\n`);
  }

  if (toolCalls.length > 0) {
    sections.push(`## Tools Used`);
    sections.push(`---`);
    for (const tool of toolCalls) {
      if (tool.input) {
        sections.push(`- ${tool.name}(${tool.input})`);
      } else {
        sections.push(`- ${tool.name}`);
      }
    }
    sections.push(`---\n`);
  }

  return sections.join("\n");
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractAutoCapturePayload(
  value: unknown,
  inherited: Record<string, unknown> = {}
): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed !== undefined) {
      return extractAutoCapturePayload(parsed, inherited);
    }
    return inherited;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return inherited;
  }

  const record = value as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...inherited, ...record };

  for (const key of ["answer", "result", "data", "response", "output", "payload"]) {
    if (record[key] === undefined) continue;
    return { ...merged, ...extractAutoCapturePayload(record[key], merged) };
  }

  return merged;
}

function buildSummaryFromSections(request: unknown, outcome: unknown): string {
  const requestText = typeof request === "string" ? request.trim() : "";
  const outcomeText = typeof outcome === "string" ? outcome.trim() : "";

  const sections: string[] = [];
  if (requestText) {
    sections.push("## Request");
    sections.push(requestText);
  }
  if (outcomeText) {
    sections.push("## Outcome");
    sections.push(outcomeText);
  }

  return sections.join("\n\n").trim();
}

function normalizeSummaryValue(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = tryParseJson(trimmed);
    if (parsed !== undefined && parsed !== value) {
      const normalizedParsed = normalizeSummaryValue(parsed);
      if (normalizedParsed) {
        return normalizedParsed;
      }
    }
    return trimmed;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;
  return buildSummaryFromSections(record.request, record.outcome);
}

function normalizeTagsValue(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.toLowerCase().trim())
    .filter(Boolean);
}

function normalizeAutoCaptureResult(raw: unknown): {
  summary: string;
  type: string;
  tags: string[];
} {
  const payload = extractAutoCapturePayload(raw);
  const type = typeof payload.type === "string" ? payload.type.trim().toLowerCase() : "";
  const summary =
    normalizeSummaryValue(payload.summary) ||
    buildSummaryFromSections(payload.request, payload.outcome) ||
    (typeof payload.answer === "string" ? payload.answer.trim() : "");
  const tags = normalizeTagsValue(payload.tags);

  if (type === "skip") {
    return {
      summary,
      type: "skip",
      tags,
    };
  }

  if (!summary) {
    throw new Error(
      `AutoCapture returned unsupported payload: ${JSON.stringify(raw).slice(0, 500)}`
    );
  }

  return {
    summary,
    type: type || "other",
    tags,
  };
}

async function generateSummary(
  context: string,
  sessionID: string,
  userPrompt: string
): Promise<{ summary: string; type: string; tags: string[] } | null> {
  // Opencode provider path (when opencodeProvider + opencodeModel configured)
  if (CONFIG.opencodeProvider && CONFIG.opencodeModel) {
    if (CONFIG.memoryModel) {
      log("opencodeProvider takes precedence over memoryModel for auto-capture");
    }

    const { isProviderConnected, generateStructuredOutput } =
      await import("./ai/opencode-provider.js");

    if (!isProviderConnected(CONFIG.opencodeProvider)) {
      log("AutoCapture: provider not reported as connected; trying direct config resolution", {
        providerName: CONFIG.opencodeProvider,
      });
    }

    const { detectLanguage, getLanguageName } = await import("./language-detector.js");
    const targetLang =
      CONFIG.autoCaptureLanguage === "auto" || !CONFIG.autoCaptureLanguage
        ? detectLanguage(userPrompt)
        : CONFIG.autoCaptureLanguage;
    const langName = getLanguageName(targetLang);

    const systemPrompt = `You are a technical memory recorder for a software development project.

RULES:
1. ONLY capture technical work (code, bugs, features, architecture, config)
2. SKIP non-technical by returning type="skip"
3. NO meta-commentary or behavior analysis
4. Include specific file names, functions, technical details
5. Generate 2-4 technical tags (e.g., "react", "auth", "bug-fix")
6. You MUST write the summary in ${langName}.

FORMAT:
## Request
[1-2 sentences: what was requested, in ${langName}]

## Outcome
[1-2 sentences: what was done, include files/functions, in ${langName}]

SKIP if: greetings, casual chat, no code/decisions made
CAPTURE if: code changed, bug fixed, feature added, decision made`;

    const aiPrompt = `${context}

Analyze this conversation. If it contains technical work (code, bugs, features, decisions), create a concise summary and relevant tags. If it's non-technical (greetings, casual chat, incomplete requests), return type="skip" with empty summary.`;

    const { z } = await import("zod");
    const schema = z.unknown();

    const result = await generateStructuredOutput({
      providerName: CONFIG.opencodeProvider,
      modelId: CONFIG.opencodeModel,
      systemPrompt,
      userPrompt: aiPrompt,
      schema,
      temperature:
        CONFIG.memoryTemperature === false ? undefined : (CONFIG.memoryTemperature ?? 0.3),
    });

    return normalizeAutoCaptureResult(result);
  }

  // Existing manual config path
  if (!CONFIG.memoryModel || !CONFIG.memoryApiUrl) {
    throw new Error("External API not configured for auto-capture");
  }

  const { AIProviderFactory } = await import("./ai/ai-provider-factory.js");
  const { buildMemoryProviderConfig } = await import("./ai/provider-config.js");
  const { detectLanguage, getLanguageName } = await import("./language-detector.js");

  const providerConfig = buildMemoryProviderConfig(CONFIG);

  const provider = AIProviderFactory.createProvider(CONFIG.memoryProvider, providerConfig);

  const targetLang =
    CONFIG.autoCaptureLanguage === "auto" || !CONFIG.autoCaptureLanguage
      ? detectLanguage(userPrompt)
      : CONFIG.autoCaptureLanguage;

  const langName = getLanguageName(targetLang);

  const systemPrompt = `You are a technical memory recorder for a software development project.

RULES:
1. ONLY capture technical work (code, bugs, features, architecture, config)
2. SKIP non-technical by returning type="skip"
3. NO meta-commentary or behavior analysis
4. Include specific file names, functions, technical details
5. Generate 2-4 technical tags (e.g., "react", "auth", "bug-fix")
6. You MUST write the summary in ${langName}.

FORMAT:
## Request
[1-2 sentences: what was requested, in ${langName}]

## Outcome
[1-2 sentences: what was done, include files/functions, in ${langName}]

SKIP if: greetings, casual chat, no code/decisions made
CAPTURE if: code changed, bug fixed, feature added, decision made`;

  const aiPrompt = `${context}

Analyze this conversation. If it contains technical work (code, bugs, features, decisions), create a concise summary and relevant tags. If it's non-technical (greetings, casual chat, incomplete requests), return type="skip" with empty summary.`;

  const toolSchema = {
    type: "function" as const,
    function: {
      name: "save_memory",
      description: "Save the conversation summary as a memory",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Markdown-formatted summary of the conversation",
          },
          type: {
            type: "string",
            description:
              "Type of memory: 'skip' for non-technical conversations, or technical type (feature, bug-fix, refactor, analysis, configuration, discussion, other)",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "List of 2-4 technical tags related to the memory",
          },
        },
        required: ["summary", "type", "tags"],
      },
    },
  };

  const result = await provider.executeToolCall(systemPrompt, aiPrompt, toolSchema, sessionID);

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to generate summary");
  }

  return normalizeAutoCaptureResult(result.data);
}
