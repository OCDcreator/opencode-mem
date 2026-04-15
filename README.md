# OpenCode Memory

[![npm version](https://img.shields.io/npm/v/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![npm downloads](https://img.shields.io/npm/dm/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![license](https://img.shields.io/npm/l/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)

![OpenCode Memory Banner](.github/banner.png)

A persistent memory system for AI coding agents that enables long-term context retention across sessions using local vector database technology.

## Fork Status

This repository is the actively maintained fork:

- **Fork**: `OCDcreator/opencode-mem`
- **Upstream**: `tickernelz/opencode-mem`
- **Local package version in this fork**: `2.13.0-custom`

The fork keeps upstream's core memory plugin behavior, but it is **not** a
pure mirror. It prioritizes:

- stable local plugin startup
- Windows-first development **with macOS parity**
- safer local-vs-remote embedding behavior
- local wrapper iteration and Web UI usability improvements

## What This Fork Changes

Compared with upstream, this fork currently keeps several practical deltas:

- **Embedding startup is safer**: local embedding stays lazy-loaded, and remote embedding does not force local model startup during read-only flows.
- **Embedding runtime is more install-safe**: local embedding now uses `@huggingface/transformers`, which is more robust in plugin install contexts that ignore postinstall scripts.
- **Build tooling stays cross-platform**: web/docs packaging uses a Node-based copy step instead of shell-only commands, so `bun run build` remains friendly to both Windows and macOS.
- **OpenCode integration is hardened**: the plugin loader/export path and provider startup path are tuned for local OpenCode wrapper workflows used in this fork.
- **Web UI is more user-facing**: the fork adds bilingual UI improvements, in-app docs, clearer memory stats, and explanatory tooltips.
- **Header branding is fork-aware**: the Web UI explicitly links both the upstream repo and this fork.

## Compatibility Notes

- **Remote embedding mode** is still the safest startup path when you want the Web UI and stats endpoints to remain available even if local model download is unavailable.
- **Local embedding mode** still accepts Hugging Face model IDs such as `Xenova/nomic-embed-text-v1` and `Xenova/all-MiniLM-L6-v2`; only the runtime package changed, not the model naming scheme.
- This fork aims to keep Windows and macOS behavior aligned. Avoid reintroducing shell-only build commands or platform-specific path hacks.

## Visual Overview

**Project Memory Timeline:**

![Project Memory Timeline](.github/screenshot-project-memory.png)

**User Profile Viewer:**

![User Profile Viewer](.github/screenshot-user-profile.png)

## Core Features

Local vector database with SQLite + USearch-first vector indexing and ExactScan fallback, persistent project memories, automatic user profile learning, unified memory-prompt timeline, full-featured web UI, intelligent prompt-based memory extraction, multi-provider AI support (OpenAI, Anthropic), 12+ local embedding models, smart deduplication, and built-in privacy protection.

## Prerequisites

This plugin uses `USearch` for preferred in-memory vector indexing with automatic ExactScan fallback. No custom SQLite build or browser runtime shim is required.

**Recommended runtime:**

- Bun
- Standard OpenCode plugin environment

**Notes:**

- If `USearch` is unavailable or fails at runtime, the plugin automatically falls back to exact vector scanning.
- SQLite remains the source of truth; search indexes are rebuilt from SQLite data when needed.

## Getting Started

Add to your OpenCode configuration at `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugin": ["opencode-mem"],
}
```

The plugin downloads automatically on next startup.

## Usage Examples

```typescript
memory({ mode: "add", content: "Project uses microservices architecture" });
memory({ mode: "search", query: "architecture decisions" });
memory({ mode: "search", query: "architecture decisions", scope: "all-projects" });
memory({ mode: "profile" });
memory({ mode: "list", limit: 10 });
```

Access the web interface at `http://127.0.0.1:4747` for visual memory browsing and management.

## Configuration Essentials

Configure at `~/.config/opencode/opencode-mem.jsonc`:

```jsonc
{
  "storagePath": "~/.opencode-mem/data",
  "userEmailOverride": "user@example.com",
  "userNameOverride": "John Doe",
  "embeddingModel": "Xenova/nomic-embed-text-v1",
  "memory": {
    "defaultScope": "project",
  },
  "webServerEnabled": true,
  "webServerPort": 4747,

  "autoCaptureEnabled": true,
  "autoCaptureLanguage": "auto",

  "opencodeProvider": "anthropic",
  "opencodeModel": "claude-haiku-4-5-20251001",

  "showAutoCaptureToasts": true,
  "showUserProfileToasts": true,
  "showErrorToasts": true,

  "userProfileAnalysisInterval": 10,
  "maxMemories": 10,

  "compaction": {
    "enabled": true,
    "memoryLimit": 10,
  },
  "chatMessage": {
    "enabled": true,
    "maxMemories": 3,
    "excludeCurrentSession": true,
    "maxAgeDays": undefined,
    "injectOn": "first",
  },
}
```

### Memory Scope

- `scope: "project"`: query only the current project. This is the default.
- `scope: "all-projects"`: query `search` / `list` across all project shards.
- `memory.defaultScope` sets the default query scope when no explicit scope is provided.

### Auto-Capture AI Provider

**Recommended:** Use opencode's built-in providers (no separate API key needed):

```jsonc
"opencodeProvider": "anthropic",
"opencodeModel": "claude-haiku-4-5-20251001",
```

This leverages your existing opencode authentication (OAuth or API key). Works with Claude Pro/Max plans via OAuth - no individual API keys required.

Supported providers: `anthropic`, `openai`

**Fallback:** Manual API configuration (if not using opencodeProvider):

```jsonc
"memoryProvider": "openai-chat",
"memoryModel": "gpt-4o-mini",
"memoryApiUrl": "https://api.openai.com/v1",
"memoryApiKey": "sk-...",
```

**API Key Formats:**

```jsonc
"memoryApiKey": "sk-..."
"memoryApiKey": "file://~/.config/opencode/api-key.txt"
"memoryApiKey": "env://OPENAI_API_KEY"
```

Full documentation available in this README.

## Fork vs Upstream Links

- **Fork repository**: https://github.com/OCDcreator/opencode-mem
- **Upstream repository**: https://github.com/tickernelz/opencode-mem
- **Upstream issues**: https://github.com/tickernelz/opencode-mem/issues

## Development & Contribution

Build and test locally:

```bash
bun install
bun run build
bun run typecheck
bun run format
```

For work that targets this fork specifically, prefer preserving:

- cross-platform `bun run build`
- local-wrapper / OpenCode loader compatibility
- lazy local embedding startup
- remote embedding not forcing local model initialization on read-only endpoints

Contributions are welcome both upstream and in this fork, but please call out
when a change depends on fork-only behavior.

## License & Links

MIT License - see LICENSE file

- **Repository**: https://github.com/tickernelz/opencode-mem
- **Fork Repository**: https://github.com/OCDcreator/opencode-mem
- **Issues**: https://github.com/tickernelz/opencode-mem/issues
- **OpenCode Platform**: https://opencode.ai

Inspired by [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)
