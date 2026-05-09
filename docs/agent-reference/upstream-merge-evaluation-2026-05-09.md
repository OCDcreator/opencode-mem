# Upstream Merge Evaluation — 2026-05-09

**Evaluation date:** 2026-05-09
**Last synced upstream commit:** `40508eb` (2026-04-15)
**Upstream review window:** `40508eb` → `a06a200` (2026-04-15 → 2026-05-09)
**Upstream tag:** `v2.14.0`
**Local fork version:** `2.14.1`

---

## 1. Executive Summary

Upstream `tickernelz/opencode-mem` has 6 new commits since the last sync. This evaluation determines which commits are safe and valuable to absorb into the fork `OCDcreator/opencode-mem`, and which should be deferred or skipped.

**Implementation update:** The fork now absorbs the valuable upstream changes from this window while preserving fork-specific compatibility.

**Key findings:**
1. The embedding hang/type-safety fixes (`f455c8e` + `9e50c26`) are valuable and were manually ported because local `embedding.ts` structure differs from upstream.
2. The AI provider refactor (`8c5d5a0`) is valuable, but a direct cherry-pick would drop the fork's direct-config fallback. It was absorbed as a hybrid: use OpenCode v2 `session.prompt` when a connected provider and v2 client are available, then retain direct config fallback for local/Desktop stability.
3. The direct `@opencode-ai/sdk` dependency has been upgraded to `^1.14.41`; this provides `@opencode-ai/sdk/v2/client` and `session.prompt()` structured output support.

**Completed action:**
1. Manually ported the embedding fixes (`f455c8e` + `9e50c26`).
2. Upgraded the direct SDK dependency to latest `1.14.41`.
3. Manually absorbed the v2 SDK provider path from `8c5d5a0` while retaining fallback behavior.
4. Skipped already-covered and administrative commits.

---

## 2. Upstream Commits Reviewed

| Commit | Message | Verdict |
|--------|---------|---------|
| `f455c8e` | fix(embedding): prevent pipeline() hang in Node/Bun runtime | **Absorb** (manual port) |
| `20748be` | fix(api): remove embedding warmup from read-only handlers | **Already covered** |
| `9e50c26` | fix(embedding): replace 'as any' with PretrainedModelOptions type | **Absorb** (with f455c8e) |
| `8c5d5a0` | refactor(ai): use opencode v2 SDK session.prompt for structured output | **Absorb** (hybrid manual port) |
| `675813c` | Merge PR #100 | **Skip** (merge commit) |
| `1269947` | Merge PR #101 | **Skip** (merge commit) |
| `a06a200` | chore: bump version to 2.14.0 | **Skip upstream patch** (fork version set to 2.14.1) |

---

## 3. Detailed Evaluation

### 3.1 `f455c8e` — Embedding Pipeline Hang Fix

**Value: HIGH | Risk: LOW**

**Problem fixed:**
`@huggingface/transformers` v4 `pipeline("feature-extraction", ...)` hangs indefinitely (35s+) on first call in Node.js/Bun, blocking all subsequent `embed()` calls. Symptoms: web UI blank, `/api/search` returns "Empty reply from server".

**Two root causes:**

1. **ONNX WASM threading deadlock**
   - `@huggingface/transformers` v4 defaults `wasm.numThreads > 1`
   - Node.js and Bun lack `SharedArrayBuffer` support
   - `onnxruntime-web` deadlocks during pipeline init
   - **Fix:** Force `numThreads = 1` in `ensureTransformersLoaded()`

2. **dtype default mismatch**
   - Default dtype tries to load `model.onnx` (fp32, ~500MB)
   - Cached model directory only ships `model_quantized.onnx`
   - Falls back to network fetch from huggingface.co
   - In restricted networks this fails with "Unable to connect"
   - **Fix:** Pass `dtype: "q8"` to use local quantized model unconditionally

**Local code status after this pass:**
- `src/services/embedding.ts` (`getTransformers()`) sets `wasm.numThreads = 1` when the ONNX WASM backend is present.
- `src/services/embedding.ts` (`initializeModel()`) passes typed `dtype: "q8"` pipeline options.
- Fork uses same `@huggingface/transformers ^4.0.1`; the relevant upstream mitigation has been manually absorbed.

**Why manual port instead of cherry-pick:**
Local `embedding.ts` structure differs from upstream. Upstream has `ensureTransformersLoaded()` as a module-level async function; local wraps it inside `getTransformers()` as a class method. The logic is identical but the surrounding code layout differs. Blind cherry-pick would cause merge conflicts.

**Potential risk:**
`dtype: "q8"` assumes the model has quantized weights. If a user configures a custom `embeddingModel` without q8 support, pipeline init may fail. Mitigation: if this occurs, add a config option to override dtype.

---

### 3.2 `20748be` — Remove Embedding Warmup from Read-Only Handlers

**Value: MEDIUM | Risk: NONE | Status: ALREADY COVERED**

**What it does:** Removes `await embeddingService.warmup()` from `handleListTags`, `handleListMemories`, and `handleStats`, so read-only APIs respond immediately even when the embedding model is not loaded.

**Local code status:**
- `handleListTags()` (`api-handlers.ts:101`) — **no warmup call** ✓
- `handleListMemories()` (`api-handlers.ts:135`) — **no warmup call** ✓
- `handleStats()` (`api-handlers.ts:645`) — **no warmup call** ✓
- `handleSearch()` (`api-handlers.ts:489`) — still calls warmup (correct, search needs query embedding) ✓

This matches the hard invariant in `AGENTS.md` §5: "Do not await embedding or memory warmup during plugin init or read-only endpoints." The fork already implements this correctly. No action needed.

---

### 3.3 `9e50c26` — Type Safety for Embedding Options

**Value: MEDIUM | Risk: LOW**

**What it does:** Replaces `as any` cast on pipeline options with the official `PretrainedModelOptions` type, so typos in `dtype` or other option keys fail at compile time.

**Dependency:** This commit builds on `f455c8e` (it types the `dtype: "q8"` option). Must be applied together.

**Local code status after this pass:** The pipeline options are typed with `PretrainedModelOptions` and include `dtype: "q8"`.

---

### 3.4 `8c5d5a0` — AI Provider Refactor (opencode v2 SDK)

**Value: HIGH | Risk: MEDIUM | Status: ABSORBED AS HYBRID**

**What it does:**
- Replaces manual auth.json parsing + OAuth refresh + direct HTTPS provider calls with opencode's v2 client SDK `session.prompt`
- Reduces `opencode-provider.ts` from 414 lines to ~147 lines
- Deletes dependencies: `@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai`
- Unlocks GitHub Copilot and other providers through opencode's native routing

**Why direct cherry-pick was avoided:**

1. **Fork-specific compatibility concerns**
   - Upstream refactor removes "fallback to direct config parsing when provider is not in connected providers list" behavior
   - Fork relies on this fallback for Desktop/local plugin stability (see `auto-capture.ts`, `user-memory-learning.ts`)
   - Upstream binds provider calls to `ctx.serverUrl`; fork uses fire-and-forget initialization, early auto-capture may hit uninitialized client state

2. **Implementation strategy used**
   - Upgrade direct `@opencode-ai/sdk` dependency to `^1.14.41`
   - Add v2 client helpers and structured-output `session.prompt` path
   - Route connected providers through v2 when the client is initialized
   - Preserve current direct provider/config fallback when v2 is unavailable, disconnected, or fails
   - Remove residual `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `ai` dependencies after tests no longer require them

---

## 4. SDK Version Analysis

| Source | Version | Notes |
|--------|---------|-------|
| `package.json` declaration | `^1.14.41` | Direct SDK dependency upgraded to latest available on 2026-05-09 |
| Actually installed direct dependency (`node_modules/@opencode-ai/sdk`) | `1.14.41` | Real version on disk after `bun install` |
| Nested plugin dependency | `1.3.13` | `@opencode-ai/plugin@1.3.13` still carries its own nested SDK, but direct imports resolve to the upgraded dependency |
| Latest on npm registry | `1.14.41` | Published 2026-05-09 |
| Upstream `8c5d5a0` requirement | `/v2/client` subpath | Available in the upgraded direct SDK |

**Conclusion:** SDK version is no longer a blocker. The direct dependency now provides the v2 client API required by upstream `8c5d5a0`; the remaining risk is runtime compatibility with the fork's local/Desktop fallback expectations, handled by the hybrid implementation.

**Source verification:** Inspected local opencode repository (`open-source-project/AI-tools-agents/opencode/packages/sdk/js/src/v2/`):
- `v2/client.ts` exports `createOpencodeClient()` and `OpencodeClient` class
- `v2/gen/sdk.gen.ts` defines `session.prompt()` with `format?: OutputFormat` parameter
- `OutputFormat` includes `json_schema` variant: `{ type: "json_schema", schema: JsonSchema, retryCount?: number }`
- This confirms upstream `8c5d5a0` uses a real, implemented API, not experimental/unreleased code

---

## 5. Implementation Plan

### Phase 1: Embedding Fixes (Immediate)

**Files to modify:**
- `src/services/embedding.ts`

**Changes:**
1. In `getTransformers()` (around line 137-143), add:
   ```typescript
   // CRITICAL: Disable WASM multi-threading. In Node.js/Bun (no SharedArrayBuffer),
   // ONNX runtime hangs indefinitely during pipeline() init when threads > 1.
   try {
     (transformers.env as any).backends.onnx.wasm.numThreads = 1;
   } catch (e) {
     log("Failed to set wasm.numThreads", { error: String(e) });
   }
   ```

2. In `initializeModel()` (around line 65), add `dtype: "q8"` to pipeline options:
   ```typescript
   this.pipe = await pipeline("feature-extraction", CONFIG.embeddingModel, {
     progress_callback: progressCallback,
     dtype: "q8", // Force quantized ONNX; avoids downloading fp32 model.onnx
   });
   ```

3. Optionally add `PretrainedModelOptions` type import for type safety (from `9e50c26`).

**Verification:**
- `bun run typecheck`
- `bun run build`
- `bun test tests/embedding-transformers-options.test.ts`
- `bun test tests/vector-search-backend-integration.test.ts`
- `bun test tests/vector-backends/*.test.ts`

### Phase 2: Dependency Cleanup (Optional, Low Priority)

**Files to modify:**
- `package.json` — remove `@ai-sdk/anthropic`, `@ai-sdk/openai`, `ai`
- `tests/opencode-provider.test.ts` — fix imports if they reference removed packages
- `bun.lock` — regenerate

**Verification:**
- `bun install`
- `bun test tests/opencode-provider.test.ts`

### Phase 3: AI Provider Refactor (Completed as Hybrid)

**Applied prerequisites:**
- Upgraded `@opencode-ai/sdk` from `^1.3.0` to `^1.14.41`
- Verified `/v2/client` import and `session.prompt` structured-output types through targeted tests

**Verified v2 client API (from source inspection):**
```typescript
import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2/client"

const client = createOpencodeClient({ baseUrl: serverUrl })
// session.prompt supports structured output via json_schema
const response = await client.session.prompt({
  sessionID: "transient-session-id",
  model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  format: { type: "json_schema", schema: zodSchemaToJsonSchema(schema) },
  parts: [{ type: "text", text: userPrompt }],
  system: systemPrompt,
})
```

**Strategy used:**
1. Upgrade SDK in `package.json`: `"@opencode-ai/sdk": "^1.14.41"`
2. Add v2 client initialization in `src/index.ts`: `setV2Client(createV2Client(ctx.serverUrl))`
3. Refactor `opencode-provider.ts`:
   - Keep existing direct provider/config path as fallback
   - Add v2 `session.prompt` path for connected providers
   - Support both upstream `{ client, providerID, modelID }` and existing fork `{ providerName, modelId }` call shapes
4. Leave `auto-capture.ts` and `user-memory-learning.ts` on the existing call shape; they now automatically route through v2 when possible and retain fallback
5. Rewrite `tests/opencode-provider.test.ts` to mock v2 HTTP calls and preserve config-resolution coverage

**Risk mitigation:**
- Preserve manual provider fallback for Desktop/local plugin stability
- Ensure early auto-capture waits for v2 client initialization or falls back to manual path
- Cover the v2 route, error cleanup, and fallback behavior with focused tests before merging

---

## 6. Verification Checklist

### For Phase 1 (Embedding Fixes)

- [x] `bun run typecheck` passes
- [x] `bun run build` succeeds
- [x] `bun test tests/embedding-transformers-options.test.ts` passes
- [x] `bun test tests/vector-search-backend-integration.test.ts` passes
- [x] `bun test tests/vector-backends/*.test.ts` passes
- [ ] Cold-start test: delete `.cache` directory, run plugin, verify `/api/search` responds within 5 seconds
- [ ] Web UI loads without "Empty reply from server"
- [ ] Local embedding produces vectors with expected dimensions in live runtime
- [ ] Remote embedding path (if configured) still works in live runtime

### For Phase 3 (AI Refactor Hybrid)

- [x] SDK upgraded and `/v2/client` import resolves
- [x] `bun test tests/opencode-provider.test.ts` passes with new implementation
- [x] Graceful fallback when v2 client is unavailable
- [ ] Auto-capture works with configured OpenCode-routed providers in live runtime
- [ ] User profile learning works with configured OpenCode-routed providers in live runtime
- [ ] Desktop plugin mode tested

---

## 7. Upstream Sync Log Entry

The completed pass is recorded in `docs/agent-reference/upstream-sync-log.md` under:

- `2026-05-09 — Review upstream changes through a06a200`
- cursor advanced to `a06a200`
- local fork version set to `2.14.1`

---

*Report generated by agent evaluation on 2026-05-09. Next review should start from `a06a200` unless a full re-audit is requested.*
