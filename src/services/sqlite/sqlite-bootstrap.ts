import { createRequire } from "node:module";

export function getDatabase(): typeof import("bun:sqlite").Database {
  const requireModule = createRequire(import.meta.url);

  try {
    return requireModule("bun:sqlite").Database as typeof import("bun:sqlite").Database;
  } catch (bunError) {
    try {
      const { DatabaseSync } = requireModule("node:sqlite") as {
        DatabaseSync: new (path: string) => any;
      };

      return class NodeSqliteDatabase extends DatabaseSync {
        run(sql: string, ...params: unknown[]) {
          return this.prepare(sql).run(...normalizeParams(params));
        }

        prepare(sql: string) {
          const statement = super.prepare(sql);
          return {
            run: (...params: unknown[]) => statement.run(...normalizeParams(params)),
            get: (...params: unknown[]) => statement.get(...normalizeParams(params)),
            all: (...params: unknown[]) => statement.all(...normalizeParams(params)),
            iterate: (...params: unknown[]) => statement.iterate(...normalizeParams(params)),
          };
        }
      } as unknown as typeof import("bun:sqlite").Database;
    } catch (nodeError) {
      throw new Error(
        `No supported SQLite runtime found. bun:sqlite failed: ${String(
          bunError
        )}; node:sqlite failed: ${String(nodeError)}`
      );
    }
  }
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
}
