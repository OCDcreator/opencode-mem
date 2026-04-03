import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

import { initConfig, CONFIG } from "../src/config.ts";
import { memoryClient } from "../src/services/client.ts";
import { getTags } from "../src/services/tags.ts";
import { generateStructuredOutput } from "../src/services/ai/opencode-provider.ts";

type PromptRow = {
  id: string;
  sessionId: string;
  messageId: string;
  projectPath: string | null;
  content: string;
  createdAt: number;
  captured: number;
  linkedMemoryId: string | null;
};

type PromptCluster = {
  key: string;
  sessionId: string;
  projectPath: string | null;
  prompts: PromptRow[];
  startedAt: number;
  endedAt: number;
};

const USER_PROMPTS_DB_PATH = join(homedir(), ".opencode-mem", "data", "user-prompts.db");
const OPENCODE_CONFIG_STATE_PATH = join(homedir(), ".config", "opencode");
const DEFAULT_GAP_MINUTES = 20;
const DEFAULT_MAX_CLUSTER_PROMPTS = 12;

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractPayload(
  value: unknown,
  inherited: Record<string, unknown> = {}
): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    if (parsed !== undefined) {
      return extractPayload(parsed, inherited);
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
    return { ...merged, ...extractPayload(record[key], merged) };
  }

  return merged;
}

function buildSummaryFromSections(request: unknown, outcome: unknown): string {
  const requestText = typeof request === "string" ? request.trim() : "";
  const outcomeText = typeof outcome === "string" ? outcome.trim() : "";
  const parts: string[] = [];

  if (requestText) {
    parts.push("## Request");
    parts.push(requestText);
  }

  if (outcomeText) {
    parts.push("## Outcome");
    parts.push(outcomeText);
  }

  return parts.join("\n\n").trim();
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

function normalizeBackfillResult(raw: unknown): {
  summary: string;
  type: string;
  tags: string[];
} {
  const payload = extractPayload(raw);
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
    throw new Error(`Unsupported backfill payload: ${JSON.stringify(raw).slice(0, 500)}`);
  }

  return {
    summary,
    type: type || "discussion",
    tags: tags.slice(0, 4),
  };
}

function loadTargetPrompts(db: Database): PromptRow[] {
  const query = db.query(`
    SELECT
      id,
      session_id AS sessionId,
      message_id AS messageId,
      project_path AS projectPath,
      content,
      created_at AS createdAt,
      captured,
      linked_memory_id AS linkedMemoryId
    FROM user_prompts
    WHERE linked_memory_id IS NULL AND captured IN (0, 2)
    ORDER BY COALESCE(project_path, ''), session_id, created_at
  `);

  return query.all() as PromptRow[];
}

function buildClusters(
  prompts: PromptRow[],
  gapMinutes: number,
  maxClusterPrompts: number
): PromptCluster[] {
  const gapMs = gapMinutes * 60 * 1000;
  const clusters: PromptCluster[] = [];
  let current: PromptCluster | null = null;

  for (const prompt of prompts) {
    const currentKey = `${prompt.projectPath ?? ""}::${prompt.sessionId}`;
    const shouldStartNewCluster =
      !current ||
      current.key !== currentKey ||
      prompt.createdAt - current.endedAt > gapMs ||
      current.prompts.length >= maxClusterPrompts;

    if (shouldStartNewCluster) {
      current = {
        key: currentKey,
        sessionId: prompt.sessionId,
        projectPath: prompt.projectPath,
        prompts: [],
        startedAt: prompt.createdAt,
        endedAt: prompt.createdAt,
      };
      clusters.push(current);
    }

    current.prompts.push(prompt);
    current.endedAt = prompt.createdAt;
  }

  return clusters;
}

function buildClusterContext(cluster: PromptCluster): string {
  const promptLines = cluster.prompts.map((prompt, index) => {
    const timestamp = new Date(prompt.createdAt).toISOString();
    return `${index + 1}. [${timestamp}] ${prompt.content.trim()}`;
  });

  return [
    `Project path: ${cluster.projectPath ?? "(unknown)"}`,
    `Session ID: ${cluster.sessionId}`,
    "",
    "Historical user prompts only:",
    promptLines.join("\n"),
  ].join("\n");
}

async function summarizeCluster(cluster: PromptCluster): Promise<{
  summary: string;
  type: string;
  tags: string[];
}> {
  const { z } = await import("zod");
  const schema = z.unknown();

  const systemPrompt = `You are backfilling project memory for a coding assistant plugin.

RULES:
1. Use ONLY the provided user prompts. No assistant transcript is available.
2. Do NOT invent completed code changes, commands, or assistant actions unless the user prompts themselves confirm them.
3. If the prompts describe technical work, debugging, setup, architecture, configuration, decisions, or concrete technical requests, capture them even when unresolved.
4. If the prompts are casual, too vague, or contain no durable technical value, return type="skip".
5. If no confirmed implementation outcome exists, state clearly in the Outcome section that the discussion/troubleshooting remained in progress.
6. If the outcome is not confirmed, prefer type="discussion" or type="analysis". Do NOT use "bug-fix", "feature", "refactor", or "configuration" unless the user prompts themselves confirm that work actually happened.
7. Keep tags to 2-4 items.
8. Setup requests can still be captured as discussion/analysis when they are concrete and project-relevant.
9. Write in the same language as the prompts when clear; otherwise use Chinese.

Preferred JSON shape:
{
  "type": "feature|bug-fix|refactor|analysis|configuration|discussion|other|skip",
  "summary": "Markdown with sections ## Request and ## Outcome",
  "tags": ["tag1", "tag2"]
}

Alternative accepted shape:
{
  "type": "...",
  "summary": { "request": "...", "outcome": "..." },
  "tags": [...]
}

Return ONLY a valid JSON object.`;

  const userPrompt = `${buildClusterContext(cluster)}

Create one durable memory for this historical prompt cluster if it contains useful technical information.
If not, return type="skip".`;

  const result = await generateStructuredOutput({
    providerName: CONFIG.opencodeProvider!,
    modelId: CONFIG.opencodeModel!,
    statePath: OPENCODE_CONFIG_STATE_PATH,
    systemPrompt,
    userPrompt,
    schema,
    temperature: CONFIG.memoryTemperature === false ? undefined : (CONFIG.memoryTemperature ?? 0.2),
  });

  return normalizeBackfillResult(result);
}

function markClusterCaptured(db: Database, promptIds: string[], memoryId: string): void {
  const placeholders = promptIds.map(() => "?").join(", ");
  db.query(
    `UPDATE user_prompts
     SET captured = 1, linked_memory_id = ?
     WHERE id IN (${placeholders})`
  ).run(memoryId, ...promptIds);
}

function releaseClusterPrompts(db: Database, promptIds: string[]): void {
  const placeholders = promptIds.map(() => "?").join(", ");
  db.query(
    `UPDATE user_prompts
     SET captured = 0
     WHERE captured = 2 AND id IN (${placeholders})`
  ).run(...promptIds);
}

async function main() {
  initConfig(process.cwd());

  if (!CONFIG.opencodeProvider || !CONFIG.opencodeModel) {
    throw new Error("Backfill requires opencodeProvider + opencodeModel in config.");
  }

  const gapMinutes = Number(getArgValue("--gap-minutes") || DEFAULT_GAP_MINUTES);
  const maxClusterPrompts = Number(
    getArgValue("--max-cluster-prompts") || DEFAULT_MAX_CLUSTER_PROMPTS
  );
  const limit = Number(getArgValue("--limit") || "0");
  const apply = hasFlag("--apply");
  const projectFilter = getArgValue("--project");

  const db = new Database(USER_PROMPTS_DB_PATH);
  const allPrompts = loadTargetPrompts(db).filter((prompt) =>
    projectFilter ? prompt.projectPath === projectFilter : true
  );
  const clusters = buildClusters(allPrompts, gapMinutes, maxClusterPrompts);
  const selectedClusters = limit > 0 ? clusters.slice(0, limit) : clusters;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        promptCount: allPrompts.length,
        clusterCount: clusters.length,
        selectedClusters: selectedClusters.length,
        gapMinutes,
        maxClusterPrompts,
        projectFilter: projectFilter ?? null,
      },
      null,
      2
    )
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < selectedClusters.length; index++) {
    const cluster = selectedClusters[index];
    const projectPath = cluster.projectPath || process.cwd();

    initConfig(projectPath);

    const clusterInfo = {
      index: index + 1,
      total: selectedClusters.length,
      sessionId: cluster.sessionId,
      projectPath: cluster.projectPath,
      promptCount: cluster.prompts.length,
      promptIds: cluster.prompts.map((prompt) => prompt.id),
    };

    console.log(`\n[cluster ${clusterInfo.index}/${clusterInfo.total}] ${clusterInfo.sessionId}`);
    console.log(`project: ${cluster.projectPath ?? "(unknown)"}`);
    console.log(`prompts: ${cluster.prompts.length}`);

    try {
      const summaryResult = await summarizeCluster(cluster);
      console.log(`type: ${summaryResult.type}`);
      console.log(`tags: ${summaryResult.tags.join(", ") || "(none)"}`);
      console.log(`summary preview: ${summaryResult.summary.slice(0, 220).replace(/\s+/g, " ")}`);

      if (summaryResult.type === "skip") {
        skipped += 1;
        releaseClusterPrompts(
          db,
          cluster.prompts.map((prompt) => prompt.id)
        );
        continue;
      }

      if (!apply) {
        created += 1;
        continue;
      }

      const tags = getTags(projectPath);
      const result = await memoryClient.addMemory(summaryResult.summary, tags.project.tag, {
        source: "import",
        type: summaryResult.type,
        tags: summaryResult.tags,
        sessionID: cluster.sessionId,
        captureTimestamp: cluster.endedAt,
        displayName: tags.project.displayName,
        userName: tags.project.userName,
        userEmail: tags.project.userEmail,
        projectPath: tags.project.projectPath,
        projectName: tags.project.projectName,
        gitRepoUrl: tags.project.gitRepoUrl,
        backfill: true,
        backfillPromptOnly: true,
        backfillPromptIds: cluster.prompts.map((prompt) => prompt.id),
        backfillPromptCount: cluster.prompts.length,
        backfillStartedAt: cluster.startedAt,
        backfillEndedAt: cluster.endedAt,
      });

      if (!result.success || !result.id) {
        throw new Error(result.error || "Failed to create memory");
      }

      markClusterCaptured(
        db,
        cluster.prompts.map((prompt) => prompt.id),
        result.id
      );
      created += 1;
      console.log(`memory created: ${result.id}`);
    } catch (error) {
      failed += 1;
      releaseClusterPrompts(
        db,
        cluster.prompts.map((prompt) => prompt.id)
      );
      console.error(`cluster failed: ${String(error)}`);
    }
  }

  memoryClient.close();
  db.close();

  console.log(
    `\nBackfill finished. created=${created} skipped=${skipped} failed=${failed} mode=${
      apply ? "apply" : "dry-run"
    }`
  );
}

await main();
