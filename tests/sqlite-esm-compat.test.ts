import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

describe("sqlite runtime ESM compatibility", () => {
  it("keeps sqlite services free of CommonJS require calls", () => {
    const files = ["sqlite-bootstrap.ts", "shard-manager.ts"];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), "src", "services", "sqlite", file), "utf-8");
      expect(source).not.toMatch(/\brequire\s*\(/);
    }
  });

  it("loads built sqlite bootstrap under Node without the bun: protocol", () => {
    const result = spawnSync(
      "node",
      [
        "--input-type=module",
        "-e",
        [
          "const mod = await import('./dist/services/sqlite/sqlite-bootstrap.js?nodecheck=' + Date.now());",
          "const Database = mod.getDatabase();",
          "const db = new Database(':memory:');",
          "db.run('CREATE TABLE smoke (id INTEGER PRIMARY KEY, value TEXT)');",
          "db.run('INSERT INTO smoke (value) VALUES (?)', ['ok']);",
          "const row = db.prepare('SELECT value FROM smoke WHERE id = ?').get(1);",
          "db.close();",
          "if (!row || row.value !== 'ok') process.exit(1);",
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      }
    );

    expect(result.status).toBe(0);
  });
});
