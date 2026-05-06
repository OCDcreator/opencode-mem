# Local OpenCode Operations

This document contains the machine-specific local plugin setup, loader/debugging guidance, inspect-first paths, and verification checklists used on this machine.

If `opencode` is on `PATH`, prefer that command form in examples below. If not, use the launcher that exists in your shell such as `~/.opencode/bin/opencode` on POSIX or `opencode.cmd` / `opencode.ps1` on Windows npm installs.

`bun test` works without a `package.json` `"test"` script because Bun auto-discovers `tests/*.test.ts` and related test files.

## 1. OpenCode Installation Notes

### 1.1 Current preferred setup: local plugin mode

This fork is now intended to be loaded as a **local plugin**, not as an npm plugin.

Current preferred local setup:

- OpenCode config file: `~/.config/opencode/opencode.json`
- Local plugin wrapper: `~/.config/opencode/plugins/opencode-mem.js`
- Local plugin package marker: `~/.config/opencode/plugins/package.json` with `{ "type": "module" }`
- Wrapper target: this working copy's built file, typically:
  - Windows example: `C:/Users/lt/Desktop/Write/custom-project/opencode-mem/dist/index.js`
  - macOS example: `/Users/<you>/Desktop/Write/custom-project/opencode-mem/dist/index.js`

Important rule:

- Keep `opencode-mem` **out of** the `"plugin"` array in `~/.config/opencode/opencode.json`.
- On this machine, the local wrapper should be the source of truth.

Required wrapper shape:

```js
import { pathToFileURL } from "node:url";

const id = "opencode-mem";
const entryUrl = pathToFileURL("/absolute/path/to/opencode-mem/dist/index.js").href;

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
```

Notes:

- For Windows, prefer forward slashes inside the absolute path string, for example `C:/Users/.../dist/index.js`.
- Keep `~/.config/opencode/plugins/package.json` present with `{ "type": "module" }`. OpenCode Desktop imports local `*.js` wrappers with Node ESM semantics, and without an explicit package marker the same wrapper can be parsed under the wrong module mode.
- The wrapper may still use dynamic `import(entryUrl)` inside the async plugin function so the repo's ESM `dist/index.js` remains unchanged.
- Do not omit `id`, `OpenCodeMemPlugin`, top-level `server`, or the default `{ id, server }` object.
- Run `npm run install:local-plugin` to rewrite the machine-local wrapper and package marker from this repo, and `npm run check:local-plugin` to verify they still match the expected ESM shape.

Why this matters:

- npm plugin mode can cause OpenCode Desktop to reinstall or refresh a separate copy under cache.
- local plugin mode avoids that extra copy and keeps development pointed at this working tree.
- OpenCode's current plugin docs show local plugins as ESM modules, and this Desktop build imports local path plugins with Node ESM semantics. The explicit package marker keeps `.js` parsing stable instead of inheriting an unrelated package boundary.
- A valid wrapper is not enough: the wrapper dynamically imports this repo's ESM build, so built runtime files under `dist/services/` must not contain bare CommonJS `require()` calls or static `bun:` imports. On 2026-05-06 the Desktop loader first failed inside `dist/services/sqlite/sqlite-bootstrap.js` because it still used bare `require("bun:sqlite")`; after that was made static ESM, Desktop failed again because Electron/Node's ESM loader rejects the `bun:` protocol. The durable SQLite bootstrap path is runtime selection: `bun:sqlite` under Bun, `node:sqlite` under Desktop's Node runtime.

### 1.2 Legacy npm/cache plugin behavior

Important local behavior discovered during debugging:

- When `opencode-mem` is configured via the `"plugin"` array, OpenCode Desktop may load it from `~/.cache/opencode/node_modules/opencode-mem/`
- A symlink under `~/.config/opencode/node_modules/` was not the active path in this environment
- If Desktop falls back to the cached npm copy, it may load an outdated upstream build instead of this fork

Why this is dangerous on this machine:

- The cached upstream build reintroduced Windows startup failure involving `@xenova/transformers` / `sharp`
- When that happens, the plugin fails to load and the Web UI on `127.0.0.1:4747` disappears

Practical rule:

- Prefer local plugin mode over npm plugin mode on this machine
- If OpenCode appears to ignore local code changes, verify which `opencode-mem` path it is actually loading
- Check the desktop logs for the exact plugin target path being loaded
- If logs mention `~/.cache/opencode/node_modules/opencode-mem/dist/plugin.js`, Desktop is probably using the wrong copy again
- Apply the same check on macOS too; the exact cache root can differ, but the failure mode is the same: OpenCode can load a cached npm copy instead of your working tree.

### 1.3 Web UI lifecycle during verification

Important local behavior:

- The plugin Web UI on `127.0.0.1:4747` only stays up while a live OpenCode project instance is still running.
- Short-lived commands such as `opencode stats` are useful for loader verification, but they dispose the instance immediately after the command finishes.

Why this matters:

- Seeing `4747` disappear after a short-lived command does not mean the plugin failed to load.
- A persistent verification should use a long-lived project instance.

Practical rule:

- Use `opencode --print-logs --log-level INFO stats` for a quick loader check.
- Use `opencode . --print-logs --log-level INFO` when you need the Web UI to remain reachable while testing.

### 1.4 Documentation precedence

Important note:

- `README.md` still documents npm-plugin installation for general users.
- For this fork and this machine, the local-plugin guidance in this document takes precedence whenever it conflicts with the README.

## 2. Files Future Agents Should Inspect First

Repository files to inspect first:

- `src/plugin.ts`
- `src/services/embedding.ts`
- `src/index.ts`
- `src/services/api-handlers.ts`
- `src/services/auto-capture.ts`
- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`
- `src/services/user-prompt/user-prompt-manager.ts`
- `src/services/user-profile/user-profile-manager.ts`
- `src/services/logger.ts`
- `src/services/migration-service.ts`
- `src/services/deduplication-service.ts`
- `src/config.ts`
- `scripts/build.mjs`
- `scripts/backfill-historical-prompts.ts`
- `src/web/index.html`
- `src/web/styles.css`
- `src/web/i18n.js`
- `src/web/vendor/`
- `docs/overview/index.md`
- `docs/en/overview/index.md`
- `opencode-local-plugin-loading.md`
- `opencode-1.4-startup-cpu-investigation.md`

Local machine paths outside this repo to inspect when debugging loader/config behavior:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/plugins/opencode-mem.js`

These paths cover most of the fork-specific behavior and the local wrapper setup used on this machine.

## 3. Recommended Verification Checklist

After making changes, verify at least:

1. `bun run build`
2. Local plugin wrapper still points at this working copy's `dist/index.js`
3. `~/.config/opencode/opencode.json` does not list `opencode-mem` in the `"plugin"` array
4. Plugin module can be imported from `dist/plugin.js`
5. `npm run check:local-plugin` confirms the wrapper is current, `opencode-mem` is not in the npm plugin array, built runtime service files do not contain bare `require()`, and the built SQLite bootstrap can open an in-memory database under Node
6. `opencode --print-logs --log-level INFO stats` shows the local wrapper path loading without a plugin export error
7. A live `opencode .` instance can serve `http://127.0.0.1:4747/api/stats`
8. Remote embedding mode can return a vector successfully
9. If local embedding was touched, test first-run local model initialization separately

### 3.1 Quick Verification By Change Type

- Loader / export / build-output changes: run `bun run build`, `bun test tests/plugin-loader-contract.test.ts`, then `opencode --print-logs --log-level INFO stats`
- Provider or config parsing changes: run `bun run build`, `bun test tests/opencode-provider.test.ts`, then the same `stats` command
- Windows path or platform-compat changes: run `bun run typecheck`, `bun test tests/windows-path.test.ts`, then `bun run build`
- Web UI or static-doc asset changes: run `bun run build`, then keep `opencode . --print-logs --log-level INFO` alive while checking `http://127.0.0.1:4747/api/stats`
- Embedding-path changes: verify remote embedding returns a vector; if local embedding code changed, also test first-run local model initialization separately
- General TypeScript-only changes: run `bun run typecheck`; use `bun run format:check` as a secondary check, not as the only release gate when the repo already has unrelated formatting drift
- Broad or cross-cutting changes: after targeted checks pass, run `bun test` before considering the work complete
- Intentional formatting sweeps: run `bun run format`, then re-run the smallest relevant tests instead of relying on formatting alone
