# AGENTS.md

This document is the current maintenance guide for the `OCDcreator/opencode-mem` fork.
It is intended for future coding agents and maintainers working on this repository.

Last updated: 2026-04-02

## 1. Fork Identity

- Upstream repository: `https://github.com/tickernelz/opencode-mem`
- Fork repository: `https://github.com/OCDcreator/opencode-mem`
- Local package version in this fork: `2.12.1-custom`

This fork is not a pure mirror. It contains behavior and compatibility fixes that are important for local OpenCode usage on Windows.

## 2. What Changed In This Fork

### 2.1 Embedding loading is now mode-aware

File: `src/services/embedding.ts`

Important change:

- `@xenova/transformers` is no longer imported at module top-level.
- It is loaded dynamically only when local embedding is actually used.

Why this matters:

- The original loading path could crash plugin startup on Windows because `@xenova/transformers` pulls `sharp`.
- Remote embedding mode should not require `sharp` or local model loading at startup.

Practical rule:

- If `embeddingApiUrl` and `embeddingApiKey` are configured, the plugin should not need local `transformers` initialization during startup.

### 2.2 Windows build is fixed

Files:

- `package.json`
- `scripts/build.mjs`

Important change:

- The old build script used Unix shell commands like `mkdir -p` and `cp -r`.
- This fork replaced that with a Node-based copy step so `bun run build` works on Windows.

Practical rule:

- Use `bun run build`.
- Do not reintroduce shell-only copy commands unless they are Windows-safe.

### 2.3 Plugin startup is less fragile

Files:

- `src/index.ts`
- `src/services/api-handlers.ts`

Important change:

- Startup warmup is now background/non-blocking.
- Web UI read-only endpoints no longer force embedding warmup before responding.

Why this matters:

- The Web UI should be able to open even if embedding is not ready yet.
- A failed local model download should not completely prevent the UI from loading.

Practical rule:

- Keep startup tolerant.
- Avoid forcing `embeddingService.warmup()` in endpoints that only read metadata or list records.

### 2.4 OpenCode provider integration was rewritten

Files:

- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`

Important change:

- The old provider path depended on the `ai` package in a way that crashed plugin loading in this environment.
- This fork now reads OpenCode provider config directly from local config/state and makes provider requests without relying on the problematic startup path.

Why this matters:

- This is required for the current OpenCode setup using `zhipuai-coding-plan`.
- It also avoids startup failure caused by `@vercel/oidc` / `ai` dependency behavior in this environment.

Practical rule:

- Be careful when upgrading provider-related dependencies.
- If provider integration is changed again, re-test actual plugin loading inside OpenCode, not just isolated module imports.

### 2.5 Web UI header was customized for the fork

Files:

- `src/web/index.html`
- `src/web/styles.css`

Important change:

- The top-right header now shows two repository links:
  - `Upstream`
  - `My Fork`
- The old single small GitHub icon was replaced by clearer pill buttons.

Practical rule:

- Preserve both repository links unless the user explicitly wants a different header design.

## 3. Current Known-Good Runtime Configuration

The current local environment is configured to use:

- Auto-capture / user profile via OpenCode provider:
  - `opencodeProvider = "zhipuai-coding-plan"`
  - `opencodeModel = "glm-4.5"`
- Embedding via DashScope OpenAI-compatible endpoint:
  - `embeddingModel = "text-embedding-v4"`
  - `embeddingApiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1"`
  - `embeddingApiKey = "env://DASHSCOPE_API_KEY"`
  - `embeddingDimensions = 1024`

Important:

- `text-embedding-v4` is not auto-known by this repo's static dimension map.
- `embeddingDimensions` must be set explicitly to `1024` when using this model, or future migrations/search behavior may break.

## 4. Embedding Modes

This fork supports both embedding modes, but only one mode is active at a time.

### 4.1 Remote embedding mode

Use this when:

- local Hugging Face model download is blocked
- startup stability matters more than local-only embedding
- DashScope or another OpenAI-compatible embedding endpoint is available

Required config:

```jsonc
"embeddingModel": "text-embedding-v4",
"embeddingDimensions": 1024,
"embeddingApiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
"embeddingApiKey": "env://DASHSCOPE_API_KEY"
```

### 4.2 Local embedding mode

Use this when:

- a local / Hugging Face-backed Xenova model is desired
- the machine can access the model download source

Typical config:

```jsonc
"embeddingModel": "Xenova/nomic-embed-text-v1"
```

Notes:

- Local mode may need internet access on first use to download model artifacts.
- The default remote host used by `@xenova/transformers` is Hugging Face.
- If local mode fails with "Unable to connect", this is usually a model download/network problem, not necessarily a plugin logic problem.

## 5. Auto-Capture / Memory Model Rules

There are two different model families in this plugin:

- `embeddingModel`: used for vector search
- `memoryModel` / `opencodeModel`: used for auto-capture and user profile analysis

Current preferred rule in this fork:

- Prefer `opencodeProvider + opencodeModel` over manual `memoryModel + memoryApiUrl`.

Reason:

- The current user already has OpenCode providers configured.
- This avoids duplicating LLM credentials in `opencode-mem.jsonc`.

Current active setup:

```jsonc
"opencodeProvider": "zhipuai-coding-plan",
"opencodeModel": "glm-4.5"
```

## 6. OpenCode Installation Notes

Important local behavior discovered during debugging:

- OpenCode loads npm plugins from `~/.cache/opencode/node_modules/`
- A symlink under `~/.config/opencode/node_modules/` was not used by this environment

For local development, the active plugin path may be replaced with a Junction or symlink pointing to this working copy.

Practical rule:

- If OpenCode appears to ignore local code changes, verify which `opencode-mem` directory it is actually loading.
- Check the desktop logs for the exact `dist/plugin.js` path being loaded.

## 7. Operational Caveats

### 7.1 Vector dimension changes are destructive-ish

If embedding dimensions change:

- stored vectors may no longer match current config
- migration logic may be required
- existing memories may need re-embedding or fresh-start cleanup

Do not change embedding dimensions casually.

### 7.2 Read-only UI endpoints should stay lightweight

Avoid adding embedding warmup to:

- stats endpoints
- tag listing
- timeline listing

Otherwise the UI can become unavailable during model/network issues.

### 7.3 Do not store plaintext secrets in committed docs

Use:

- `env://...`
- `file://...`

Avoid committing real API keys to the repository.

## 8. Files Future Agents Should Inspect First

When working on this fork, start with:

- `src/services/embedding.ts`
- `src/index.ts`
- `src/services/api-handlers.ts`
- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`
- `src/config.ts`
- `src/web/index.html`
- `src/web/styles.css`

These files contain most of the fork-specific behavior changes.

## 9. Recommended Verification Checklist

After making changes, verify at least:

1. `bun run build`
2. Plugin module can be imported from `dist/plugin.js`
3. Web UI can respond on `http://127.0.0.1:4747/api/stats`
4. Remote embedding mode can return a vector successfully
5. If local embedding was touched, test first-run local model initialization separately

## 10. Current Intent Of This Fork

This fork is optimized for:

- Windows-friendly development
- OpenCode local plugin iteration
- stable startup behavior
- support for both local embedding and remote embedding
- practical use with the user's existing OpenCode provider setup

If a future change conflicts with one of those goals, prefer stability and debuggability over keeping upstream behavior unchanged.
