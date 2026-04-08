# AGENTS.md

This document is the compact maintenance entry point for the `OCDcreator/opencode-mem` fork.
It is intended for future coding agents and maintainers working on this repository.

Last updated: 2026-04-08

## 0. Read This First

Open only the subdocument relevant to your change:

- `docs/agent-reference/fork-deltas.md` — fork behavior, invariants, operational caveats
- `docs/agent-reference/runtime-config.md` — config, embedding modes, runtime architecture, model rules
- `docs/agent-reference/local-opencode-operations.md` — **machine-specific**: local wrapper setup, loader debugging, verification workflow (launcher paths live here, not in this file)

Rules of thumb:

- Run the smallest verification set that matches your change (see §8), not every workflow.
- `bun test` works without a `package.json` `"test"` script — Bun auto-discovers `tests/**/*.test.ts`.
- `bun run format:check` has pre-existing Prettier drift; treat it as advisory unless you intentionally reformatted.

## 1. Fork Identity

- Upstream repository: `https://github.com/tickernelz/opencode-mem`
- Fork repository: `https://github.com/OCDcreator/opencode-mem`
- Local package version in this fork: `2.13.0-custom`
- Maintenance priority: cross-platform local development (Windows-first, macOS parity), stable startup, local plugin iteration, and both remote and local embedding modes.

This fork is not a pure mirror — it carries compatibility fixes (many originally triggered by Windows failures) that keep local OpenCode usage stable.

## 2. Environment

- Recommended runtime from `README.md`: Bun plus the standard OpenCode plugin environment.
- `package.json` does not currently pin an `engines` version. Current toolchain assumptions track Bun 1.3-era types via `@types/bun` `^1.3.8`, TypeScript `^5.7.3`, and OpenCode plugin/sdk `^1.3.0`.
- `bun run build` compiles with Bun tooling and then runs `node scripts/build.mjs`, so keep both Bun and a Node-compatible runtime available.
- Loader verification and Web UI checks assume a working OpenCode CLI/Desktop install.

## 3. Quick Commands

| Command                                         | Purpose                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `bun install`                                   | Install or refresh dependencies; triggers `prepare` / Husky hook setup |
| `bun run dev`                                   | Run `tsc --watch`; watch TypeScript output only, not a dev server      |
| `bun run typecheck`                             | Fast TypeScript sanity check                                           |
| `bun test`                                      | Run the full Bun test suite                                            |
| `bun test tests/<name>.test.ts`                 | Run one top-level regression file                                      |
| `bun test tests/vector-backends/<name>.test.ts` | Run one vector-backend regression file                                 |
| `bun run format`                                | Rewrite supported source files with Prettier                           |
| `bun run format:check`                          | Check formatting without rewriting files                               |
| `bun run build`                                 | Rebuild `dist/` and refresh copied web/docs assets                     |
| `opencode --print-logs --log-level INFO stats`  | Quick local-wrapper/load verification                                  |
| `opencode . --print-logs --log-level INFO`      | Keep a live instance running for Web UI verification                   |

- Test files live in `tests/` and `tests/vector-backends/`; §8 maps change types to which subset to run.
- The `.husky/pre-commit` hook runs `bun run typecheck && bunx lint-staged`.

## 4. Repo Map

- `src/config.ts`: config defaults, file discovery, precedence, and example-config generation
- `src/index.ts`: main plugin implementation, hooks, idle/event orchestration, and startup flow
- `src/plugin.ts`: loader-facing entry that exports the `PluginModule` contract
- `src/services/api-handlers.ts`: stats, tags, timeline, and related web/API handlers
- `src/services/auto-capture.ts` and `src/services/user-memory-learning.ts`: memory extraction and profile-learning pipelines
- `src/services/user-prompt/`: user-prompt manager used by prompt/context assembly
- `src/services/client.ts`, `src/services/context.ts`, `src/services/user-message.ts`, `src/services/tags.ts`, and `src/services/privacy.ts`: prompt/context assembly, message parsing, tag extraction, and privacy filtering
- `src/services/embedding.ts`: remote-vs-local embedding selection and lazy model initialization
- `src/services/migration-service.ts`, `src/services/deduplication-service.ts`, and `src/services/cleanup-service.ts`: storage lifecycle, deduplication, and cleanup tasks
- `src/services/secret-resolver.ts` and `src/services/jsonc.ts`: config parsing and secret indirection helpers
- `src/services/language-detector.ts` and `src/services/logger.ts`: language heuristics and local logging
- `src/services/web-server.ts` and `src/services/web-server-worker.ts`: Bun web server, request routing, and static serving
- `src/services/ai/`: provider loading, OpenCode state, config discovery, session management, validators, and structured-output helpers
- `src/services/sqlite/`: SQLite bootstrap, shard management, and search plumbing
- `src/services/vector-backends/`: USearch / ExactScan backend selection and fallbacks
- `src/services/user-profile/`: user profile storage, context building, and helper utilities
- `src/web/` and `src/web/vendor/`: static Web UI assets copied into `dist/web/` during build
- `tests/`: Bun regression tests for loader, provider/config parsing, privacy, project scope, tags, user messages, vector backends, and Windows paths
- `scripts/build.mjs`: platform-neutral copy step used by `bun run build`
- `docs/` and `docs/en/`: bilingual user docs copied into the built Web UI

Before assuming a concern is unimplemented, scan adjacent files in `src/services/`; several behaviors live in focused one-file modules instead of large index barrels.

## 5. Hard Invariants

- Preserve the `PluginModule` export shape in `src/plugin.ts`; do not revert to a bare default export.
- Preserve both built entrypoints: package exports resolve to `dist/plugin.js`, while the local wrapper workflow on this machine typically points at `dist/index.js`.
- Do not `await` embedding or memory warmup during plugin init or read-only endpoints such as stats, tags, or timeline handlers.
- If `embeddingApiUrl` and `embeddingApiKey` are configured in `~/.config/opencode/opencode-mem.jsonc` or `<project>/.opencode/opencode-mem.jsonc`, startup should not require local `@xenova/transformers` initialization.
- Keep provider-state deduplication limited to concurrent startup work unless you have proof that later refreshes are unnecessary.
- Preserve both `Upstream` and `My Fork` repository links in the Web UI header unless the user explicitly requests a redesign.

## 6. Operational Guidance

- Rebuild `dist/` with `bun run build`; do not hand-edit built output.
- Machine-specific local plugin workflow lives in `docs/agent-reference/local-opencode-operations.md`; do not duplicate those details here.
- Prefer platform-neutral filesystem logic in build tooling; do not reintroduce Unix-only copy commands unless they are verified Windows-safe.
- `bun install` triggers `prepare`, which installs Husky hooks.
- Keep config secrets referenced via `env://...` or `file://...` when possible instead of committing plaintext credentials.

## 7. Common Gotchas

- `bun run dev` is `tsc --watch` only. It does not rebuild copied assets, run the plugin, or keep the Web UI alive.
- `bun run format:check` is a secondary check in this repo because unrelated Prettier drift already exists.
- Local plugin mode guidance is machine-specific; see `docs/agent-reference/local-opencode-operations.md`.
- If OpenCode appears to ignore local changes, verify whether Desktop is loading a cached npm copy instead of the local wrapper target.
- Treat `~/.opencode-mem/opencode-mem.log` as sensitive local debugging output.

## 8. Verification Shortcuts

| Change type                    | Verification steps                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader / export / build output | `bun run build` → `bun test tests/plugin-loader-contract.test.ts` → `opencode --print-logs --log-level INFO stats`                                                                                                                            |
| Provider / config parsing      | `bun run build` → smallest subset of `tests/{opencode-provider,config-resolution,config,ai-provider-config,anthropic-provider}.test.ts` → `stats`                                                                                             |
| Windows path / platform-compat | `bun run typecheck` → `bun test tests/windows-path.test.ts` → `bun run build`                                                                                                                                                                 |
| Message / privacy / tagging    | Smallest subset of `tests/{user-message,privacy,tags,project-scope,language-detector}.test.ts`                                                                                                                                                |
| Vector backend / embedding     | `bun test tests/vector-search-backend-integration.test.ts` + smallest relevant `tests/vector-backends/*.test.ts`. If embedding code changed, also verify a remote embedding returns a vector and separately check first-run local model init. |
| Web UI / static docs           | `bun run build` → keep `opencode . --print-logs --log-level INFO` alive → check `http://127.0.0.1:4747/api/stats`                                                                                                                             |
| TypeScript-only                | `bun run typecheck`. `format:check` is secondary because of pre-existing drift.                                                                                                                                                               |
| Broad / cross-cutting          | Targeted checks, then `bun test` before considering work complete.                                                                                                                                                                            |
| Intentional formatting sweep   | `bun run format` → re-run smallest relevant tests (don't rely on formatting alone).                                                                                                                                                           |
