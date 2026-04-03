# Development Log

## 2026-04-03 — Switch OpenCode Desktop To Local Plugin Mode

### Changed files

| File        | Change                                                       |
| ----------- | ------------------------------------------------------------ |
| `AGENTS.md` | Document local plugin mode as the preferred setup on Windows |
| `devlog.md` | Record why npm/cache plugin loading was replaced             |

### 1. Root cause of the recurring Web UI failure

OpenCode Desktop was not consistently loading this working copy.

When `opencode-mem` was configured through the `"plugin"` array in
`~/.config/opencode/opencode.json`, Desktop could reinstall or refresh an npm
copy under `~/.cache/opencode/node_modules/opencode-mem/` and load that copy
instead of this fork.

That cached copy could be an older upstream build which still triggered the
Windows startup failure involving `@xenova/transformers` / `sharp`. When the
plugin failed to load, the Web UI on `http://127.0.0.1:4747` disappeared.

### 2. Operational fix

The preferred setup on this machine is now **local plugin mode**:

- keep `opencode-mem` out of the `"plugin"` array
- load the plugin through `~/.config/opencode/plugins/opencode-mem.js`
- have that local wrapper import this working tree's built output

This avoids relying on the cache-managed npm copy and keeps OpenCode Desktop
pointed at the fork being developed locally.

### 3. Maintenance rule for future debugging

If Web UI disappears again, inspect the Desktop logs first and verify the exact
plugin target path being loaded.

If logs point at `~/.cache/opencode/node_modules/opencode-mem/dist/plugin.js`,
Desktop has probably fallen back to the wrong npm/cache copy again.

## 2026-04-02 — Windows Compatibility & Provider Rewrite

### Changed files

| File                                   | Change                                         |
| -------------------------------------- | ---------------------------------------------- |
| `src/services/embedding.ts`            | Defer `@xenova/transformers` import to runtime |
| `src/index.ts`                         | Background warmup; lazy warmup on add/search   |
| `src/services/api-handlers.ts`         | Remove forced warmup from read-only endpoints  |
| `src/services/ai/opencode-provider.ts` | Rewrite: read config directly, no `ai` SDK     |
| `src/services/ai/opencode-state.ts`    | New: extract state helpers from provider       |
| `src/web/index.html`                   | Dual repo links (Upstream + My Fork)           |
| `src/web/styles.css`                   | Pill-button style for repo links               |
| `package.json`                         | Build script uses `node scripts/build.mjs`     |
| `scripts/build.mjs`                    | New: Node-based copy step (Windows-safe)       |

### 1. `@xenova/transformers` deferred import

`@xenova/transformers` was imported at module top-level, which pulled `sharp`
and crashed plugin startup on Windows when local embedding was not even needed.

Fix: `@xenova/transformers` is now loaded via dynamic `import()` only when
local embedding is actually used. Remote embedding mode never triggers it.

### 2. Background / non-blocking warmup

`src/index.ts` previously `await`ed `memoryClient.warmup()` during plugin init,
blocking the entire startup. If warmup failed (e.g. model download timeout),
the plugin and Web UI would not load.

Fix: warmup runs in a fire-and-forget `async` IIFE. The Web UI and plugin
tools become available immediately. `add` and `search` commands call
`await memoryClient.warmup()` lazily before their first real operation.

### 3. Read-only Web UI endpoints no longer force warmup

`api-handlers.ts` previously called `await embeddingService.warmup()` in
`handleListTags`, `handleListMemories`, and `handleStats`. This meant the UI
could not render its shell if embedding was not ready.

Fix: removed those warmup calls. These endpoints now respond immediately with
whatever data is available.

### 4. opencodeProvider rewritten

The old provider integration depended on `ai`, `@ai-sdk/anthropic`,
`@ai-sdk/openai`, and `@vercel/oidc`. The `@vercel/oidc` dependency caused
plugin loading failures in this environment.

Fix: the provider now reads `opencode.json` / `opencode.jsonc` directly,
extracts `baseURL` and `apiKey`, and makes raw `fetch` calls to the
OpenAI-compatible `/chat/completions` or Anthropic `/messages` endpoints.
No `ai` SDK dependency at runtime.

State management helpers (`setStatePath`, `getStatePath`, etc.) were extracted
into a new `opencode-state.ts` to keep concerns separate.

### 5. Windows build

`package.json` build script previously ran `mkdir -p dist/web && cp -r src/web/* dist/web/`,
which fails on Windows.

Fix: replaced with `node scripts/build.mjs`, a Node-based copy using
`fs.cpSync`.

### 6. Web UI header customization

The single GitHub icon in the top-right was replaced with two pill-shaped
buttons: "Upstream" linking to `tickernelz/opencode-mem` and "My Fork" linking
to `OCDcreator/opencode-mem`. Responsive layout collapses them to full-width
on narrow screens.
