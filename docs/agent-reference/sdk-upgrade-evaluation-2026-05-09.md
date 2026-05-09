# SDK Upgrade Evaluation — 1.3.13 → 1.14.41

**Evaluation date:** 2026-05-09
**Current SDK version:** 1.3.13 (both `@opencode-ai/sdk` and `@opencode-ai/plugin`)
**Target SDK version:** 1.14.41
**Version span:** 1.3.13 → 1.14.41 (11 minor versions, ~119 commits)
**Source verification:** Inspected opencode monorepo source (`open-source-project/AI-tools-agents/opencode`)

---

## 1. Executive Summary

**Verdict: SAFE to upgrade with minimal risk**

The SDK upgrade from 1.3.13 to 1.14.41 is **backward-compatible** for the fork's current usage. The v1 APIs that opencode-mem depends on remain unchanged; v2 APIs are purely additive. No code changes are required in opencode-mem to make the upgrade work.

**Key finding:** The v2 client (`@opencode-ai/sdk/v2/client`) is confirmed to exist in SDK 1.14.41. This unblocks the upstream `8c5d5a0` AI provider refactor.

**Recommended action:**
1. Upgrade `@opencode-ai/sdk` and `@opencode-ai/plugin` to `^1.14.41`
2. Run tests to verify compatibility
3. Then evaluate absorbing upstream `8c5d5a0`

---

## 2. What Changed Between 1.3.13 and 1.14.41

### 2.1 `@opencode-ai/sdk`

**V1 API (existing, unchanged)**
- `createOpencodeClient()` — still exported from `@opencode-ai/sdk`
- `OpencodeClient` class — still exported
- `Part` type — still exported
- All v1 client methods (session, file, vcs, etc.) — preserved

**V2 API (new, additive)**
- `@opencode-ai/sdk/v2/client` — **NEW subpath export**
  - `createOpencodeClient()` — v2 version with enhanced error handling
  - `OpencodeClient` class — v2 version
  - `session.prompt()` — supports `format: { type: "json_schema", schema: {...} }`
- `@opencode-ai/sdk/v2/server` — **NEW subpath export**
- `@opencode-ai/sdk/v2` — combined client + server export

**Notable v2 client improvements (from source):**
- Better error handling: converts empty `{}` error responses into descriptive Error objects
- Content-type guard: throws descriptive error when server returns `text/html` instead of JSON
- Request/response interceptors for `x-opencode-directory` and `x-opencode-workspace` headers

### 2.2 `@opencode-ai/plugin`

**Existing APIs (backward-compatible)**
- `Plugin` type — unchanged signature
- `PluginInput` type — **extended with new fields**, but all are provided by OpenCode at runtime:
  - `client` — v1 client instance (new in 1.14.x)
  - `project` — project metadata (new in 1.14.x)
  - `worktree` — worktree path (new in 1.14.x)
  - `$` — `BunShell` instance (new in 1.14.x)
  - `experimental_workspace` — workspace adapter registration (new in 1.14.x)
  - `directory`, `serverUrl` — still present
- `PluginModule` type — **extended**:
  - `id?: string` — still present
  - `server: Plugin` — still present
  - `tui?: never` — **NEW**, prevents accidental TUI plugin export
- `tool()` function — signature unchanged
- `Part` type — re-exported from SDK, unchanged

**New hooks (additive, opt-in)**
- `experimental.chat.system.transform` — modify system prompts
- `experimental.chat.messages.transform` — modify message list
- `experimental.session.compacting` — customize compaction
- `experimental.compaction.autocontinue` — control auto-continue
- `experimental.text.complete` — text completion hook
- `tool.definition` — modify tool definitions
- `auth` — OAuth/API auth hooks
- `provider` — custom provider hook

**New features (additive)**
- `ProviderContext` type — provider metadata wrapper
- `WorkspaceInfo`, `WorkspaceTarget`, `WorkspaceAdapter` types — workspace support
- `AuthHook`, `ProviderHook` types — extensible auth/providers

---

## 3. Risk Assessment

### 3.1 Breaking Changes: NONE for our usage

| API | Usage in opencode-mem | 1.14.41 Status | Risk |
|-----|----------------------|----------------|------|
| `Plugin` type | `src/index.ts`, `src/plugin.ts` | Unchanged | None |
| `PluginInput` type | `src/index.ts`, `src/services/*.ts` | Extended (new fields) | None — runtime-provided |
| `PluginModule` type | `src/plugin.ts` | Extended (`tui?: never`) | None — optional field |
| `tool()` function | `src/index.ts` | Unchanged | None |
| `Part` type | `src/index.ts` | Unchanged | None |
| `@opencode-ai/sdk` default export | Not used directly | Preserved | None |

### 3.2 Potential Risks

**Risk 1: Dependency resolution**
- `@opencode-ai/sdk` and `@opencode-ai/plugin` must be upgraded together
- Mismatched versions could cause type errors
- **Mitigation:** Update both in `package.json` simultaneously

**Risk 2: Bun lockfile drift**
- `bun.lock` may need regeneration
- **Mitigation:** `rm -rf node_modules bun.lock && bun install`

**Risk 3: Transitive dependencies**
- SDK 1.14.41 may pull in newer versions of transitive deps
- **Mitigation:** Run `bun run typecheck` and `bun test` after upgrade

**Risk 4: TypeScript compilation**
- New types in `PluginInput` may cause stricter type checking
- **Mitigation:** `bun run typecheck` will catch any issues

---

## 4. Upgrade Procedure

### Step 1: Update package.json

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "^1.14.41",
    "@opencode-ai/sdk": "^1.14.41",
    // ... other deps unchanged
  }
}
```

### Step 2: Clean install

```bash
cd /Volumes/SDD2T/obsidian-vault-write/custom-project/opencode-mem
rm -rf node_modules bun.lock
bun install
```

### Step 3: Verify type compatibility

```bash
bun run typecheck
```

Expected result: Clean (no errors). The fork only uses stable v1 APIs that are preserved.

### Step 4: Run tests

```bash
bun test tests/plugin-loader-contract.test.ts
bun test tests/opencode-provider.test.ts
bun test tests/vector-search-backend-integration.test.ts
```

### Step 5: Runtime verification

```bash
bun run build
opencode --print-logs --log-level INFO stats
```

Verify the plugin loads correctly and stats endpoint responds.

---

## 5. Post-Upgrade: Enabling V2 Client

Once SDK is upgraded to 1.14.41, the v2 client becomes available:

```typescript
import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2/client"

// In plugin init:
const v2Client = createOpencodeClient({
  baseUrl: ctx.serverUrl,
  directory: ctx.directory,
})

// Structured output via session.prompt:
const response = await v2Client.session.prompt({
  sessionID: "transient-session-id",
  model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
  format: {
    type: "json_schema",
    schema: {
      type: "object",
      properties: { /* ... */ },
    },
  },
  parts: [{ type: "text", text: prompt }],
  system: systemPrompt,
})
```

This is exactly what upstream `8c5d5a0` implements.

---

## 6. Recommendation

**Proceed with SDK upgrade.**

The upgrade is low-risk because:
1. v1 APIs are preserved unchanged
2. v2 APIs are purely additive
3. The fork's usage is limited to stable plugin APIs
4. No code changes required in opencode-mem

After successful upgrade, `8c5d5a0` (AI provider refactor) becomes feasible and should be re-evaluated.

---

*Report generated by SDK source inspection on 2026-05-09.*
