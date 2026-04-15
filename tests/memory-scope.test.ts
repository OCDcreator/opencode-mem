import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

const connectionManagerUrl = new URL(
  "../src/services/sqlite/connection-manager.js",
  import.meta.url
).href;
const embeddingUrl = new URL("../src/services/embedding.js", import.meta.url).href;
const shardManagerUrl = new URL("../src/services/sqlite/shard-manager.js", import.meta.url).href;
const vectorSearchUrl = new URL("../src/services/sqlite/vector-search.js", import.meta.url).href;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const clientUrl = new URL("../src/services/client.js", import.meta.url).href;

type ScenarioInput = {
  mode: "list" | "search";
  scope?: "project" | "all-projects";
};

function runScenario(input: ScenarioInput) {
  const dir = mkdtempSync(join(tmpdir(), "opencode-mem-memory-scope-"));
  tempDirs.push(dir);

  const scriptPath = join(dir, "scenario.mjs");
  const script = `
import { mock } from "bun:test";

const dbByPath = new Map();

function makeShard(id) {
  return {
    id,
    scope: "project",
    scopeHash: "",
    shardIndex: 0,
    dbPath: "/tmp/" + id + ".db",
    vectorCount: 0,
    isActive: true,
    createdAt: Date.now(),
  };
}

function makeDb(path) {
  const rows = path.includes("shard-a")
    ? [{ id: "a", content: "A", created_at: 2, container_tag: "tag-a" }]
    : path.includes("shard-b")
      ? [{ id: "b", content: "B", created_at: 1, container_tag: "tag-b" }]
      : [{ id: "c", content: "C", created_at: 3, container_tag: "current" }];

  return {
    prepare(sql) {
      return {
        all(...args) {
          if (
            sql.includes("SELECT * FROM memories") &&
            sql.includes("ORDER BY created_at DESC") &&
            !sql.includes("container_tag = ?")
          ) {
            return rows;
          }
          if (sql.includes("SELECT * FROM memories") && sql.includes("container_tag = ?")) {
            const tag = args[0];
            return rows.filter((row) => row.container_tag === tag);
          }
          return rows;
        },
        get() {
          return rows[0] ?? null;
        },
        run() {},
      };
    },
    run() {},
    close() {},
  };
}

mock.module(${JSON.stringify(connectionManagerUrl)}, () => ({
  connectionManager: {
    getConnection(path) {
      if (!dbByPath.has(path)) {
        dbByPath.set(path, makeDb(path));
      }
      return dbByPath.get(path);
    },
    closeAll() {},
  },
}));

mock.module(${JSON.stringify(embeddingUrl)}, () => ({
  embeddingService: {
    isWarmedUp: true,
    warmup: async () => {},
    embedWithTimeout: async () => new Float32Array([1, 2, 3]),
  },
}));

mock.module(${JSON.stringify(shardManagerUrl)}, () => ({
  shardManager: {
    getAllShards(scope, hash) {
      return scope === "project" && hash === ""
        ? [makeShard("shard-a"), makeShard("shard-b")]
        : [makeShard("shard-current")];
    },
    getWriteShard() {
      return makeShard("shard-write");
    },
    incrementVectorCount() {},
  },
}));

mock.module(${JSON.stringify(vectorSearchUrl)}, () => ({
  vectorSearch: {
    searchAcrossShards: async (shards) =>
      shards.map((shard) => ({ id: shard.id, memory: shard.id, similarity: 1 })),
    listMemories: (db, containerTag) => {
      const sql =
        containerTag === ""
          ? "SELECT * FROM memories ORDER BY created_at DESC LIMIT ?"
          : "SELECT * FROM memories WHERE container_tag = ? ORDER BY created_at DESC LIMIT ?";
      const stmt = db.prepare(sql);
      return containerTag === "" ? stmt.all(20) : stmt.all(containerTag, 20);
    },
    insertVector: async () => {},
  },
}));

const { memoryClient } = await import(${JSON.stringify(clientUrl)});

let result;
if (${JSON.stringify(input.mode)} === "list") {
  result = await memoryClient.listMemories("current", 10, ${JSON.stringify(input.scope ?? "project")});
  console.log(JSON.stringify({ success: result.success, count: result.memories.length, ids: result.memories.map((item) => item.id) }));
} else {
  result = await memoryClient.searchMemories("hello", "current", ${JSON.stringify(input.scope ?? "project")});
  console.log(JSON.stringify({ success: result.success, count: result.results.length, ids: result.results.map((item) => item.id) }));
}
`;

  writeFileSync(scriptPath, script);

  const result = Bun.spawnSync({
    cmd: [process.execPath, scriptPath],
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = Buffer.from(result.stdout).toString("utf8").trim();
  const stderr = Buffer.from(result.stderr).toString("utf8").trim();

  return {
    exitCode: result.exitCode,
    stdout,
    stderr,
    parsed: stdout ? JSON.parse(stdout) : null,
  };
}

describe("memory scope", () => {
  it("defaults to project scope", () => {
    const result = runScenario({ mode: "list" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.success).toBe(true);
    expect(result.parsed?.count).toBe(1);
    expect(result.parsed?.ids).toEqual(["c"]);
  });

  it("uses all-projects for search when requested", () => {
    const result = runScenario({ mode: "search", scope: "all-projects" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.success).toBe(true);
    expect(result.parsed?.count).toBe(2);
    expect(result.parsed?.ids).toEqual(["shard-a", "shard-b"]);
  });

  it("lets explicit scope override for list", () => {
    const result = runScenario({ mode: "list", scope: "all-projects" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.success).toBe(true);
    expect(result.parsed?.count).toBe(2);
    expect(result.parsed?.ids).toEqual(["a", "b"]);
  });

  it("keeps project-only search when scope is project", () => {
    const result = runScenario({ mode: "search", scope: "project" });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.parsed?.success).toBe(true);
    expect(result.parsed?.count).toBe(1);
    expect(result.parsed?.ids).toEqual(["shard-current"]);
  });
});
