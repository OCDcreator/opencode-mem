# OpenCode Local Plugin Loading Playbook

This note records the exact local loading path that was verified on this
machine against the real OpenCode source, Desktop logs, and current OpenCode
plugin docs, not guessed from memory.

It is intended for future maintainers and coding agents who need to answer one
question quickly:

> How do I make `opencode-mem` load normally inside OpenCode without breaking
> the Windows-friendly fork behavior?

Related note:

- If the symptom is primarily "OpenCode 1.4 startup CPU is high" rather than
  "the plugin does not load", read `opencode-1.4-startup-cpu-investigation.md`
  as well.

## 1. Source-verified loader rules

Source-of-truth OpenCode repo on this machine:

- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/opencode`

Current OpenCode docs:

- `https://opencode.ai/docs/zh-cn/plugins/`

Key facts confirmed from those sources:

1. Local plugins are auto-loaded from:
   - `~/.config/opencode/plugins/`
   - `.opencode/plugins/`
2. OpenCode scans `{plugin,plugins}/*.{ts,js}` in those directories.
3. The documented local plugin examples use ESM exports such as `export const MyPlugin = ...`.
4. Local plugins that need package metadata or dependencies should use a `package.json` in the config/plugin package boundary.
5. Path plugins must export `id` in the loader contract used by this fork.
6. Server plugins must default export an object with `server()` in the loader contract used by this fork.
7. Local plugins and npm plugins can both load, so duplicate configuration can
   load the wrong copy.

What this means in practice:

- Do **not** assume the `"plugin"` array is required for a local wrapper.
- Do **not** debug this by changing business logic first.
- First verify the wrapper contract and the actual path OpenCode is loading.

## 2. Recommended loading mode for this fork

Use **local plugin mode**, not npm plugin mode.

Expected local setup:

- OpenCode config: `~/.config/opencode/opencode.json`
- Plugin config: `~/.config/opencode/opencode-mem.jsonc`
- Local wrapper: `~/.config/opencode/plugins/opencode-mem.js`
- Wrapper target: this repo's built entrypoint, `dist/index.js`

Important rule:

- Keep `opencode-mem` **out of** the `"plugin"` array in `~/.config/opencode/opencode.json`

Reason:

- If `opencode-mem` is also listed in the npm plugin array, OpenCode may load a
  cached npm copy from `~/.cache/opencode/node_modules/opencode-mem/` instead
  of this working tree.

## 3. Required local wrapper shape

The wrapper must satisfy the current OpenCode path-plugin contract.

Also keep this package marker next to the wrapper:

```json
{
  "type": "module"
}
```

Path:

- `~/.config/opencode/plugins/package.json`

Canonical wrapper pattern:

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

- `id` is required for path plugins.
- `OpenCodeMemPlugin` is exported for newer plugin discovery paths that read named function exports.
- The default export supports the current server-plugin contract, while the top-level `server` and `OpenCodeMemPlugin` exports keep discovery paths explicit.
- Keep `opencode-mem.js` explicitly ESM by writing `~/.config/opencode/plugins/package.json` with `{ "type": "module" }`. Otherwise Desktop can parse the wrapper under the wrong module mode and fail before the plugin starts.
- Use `npm run install:local-plugin` to rewrite the machine-local wrapper/package marker from this repo and `npm run check:local-plugin` to verify them. The check also scans built service runtime files for CommonJS `require()` calls, because the wrapper can be correct while the imported ESM build still fails.

### ESM runtime compatibility

If Desktop logs still show:

```text
error=require is not defined in ES module scope
```

after the wrapper has been made ESM-compatible, the failure is probably no
longer in `~/.config/opencode/plugins/opencode-mem.js`. Check the imported build
instead:

```powershell
rg -n "\brequire\s*\(" dist/services src/services
```

On 2026-05-06, the wrapper loaded correctly but `dist/services/sqlite/sqlite-bootstrap.js`
still contained `require("bun:sqlite")`, and `dist/services/sqlite/shard-manager.js`
still contained `require("node:fs")`. OpenCode Desktop treated the repo build as
ESM because this package has `"type": "module"`, so those CommonJS calls stopped
the plugin before the Web UI server could bind `127.0.0.1:4747`.

After removing bare `require()`, Desktop exposed the next runtime boundary:

```text
Only URLs with a scheme in: file, data, node, and electron are supported by the default ESM loader. Received protocol 'bun:'
```

That means static `import { Database } from "bun:sqlite"` is also not Desktop-safe.
The durable bootstrap must choose the SQLite implementation at runtime:

- Bun CLI path: `bun:sqlite`
- Desktop Electron/Node path: `node:sqlite`

`npm run check:local-plugin` includes a Node in-memory SQLite smoke test so this
does not regress silently.

### macOS example

```js
import { pathToFileURL } from "node:url";

const id = "opencode-mem";
const entryUrl = pathToFileURL(
  "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencode-mem/dist/index.js"
).href;

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

### Windows example

```js
import { pathToFileURL } from "node:url";

const id = "opencode-mem";
const entryUrl = pathToFileURL(
  "C:/Users/lt/Desktop/Write/custom-project/opencode-mem/dist/index.js"
).href;

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

For Windows, prefer forward slashes in the absolute path string.

## 4. Repo-side build expectation

This fork is built with:

- `bun run build`

Important repo-side requirement:

- `tsconfig.json` must include `"types": ["bun"]`

Why:

- this repo already depends on Bun runtime globals and `@types/bun`
- without the Bun types, `bunx tsc` can fail before the wrapper ever has a
  chance to load the built output

This is a build/type fix, not a runtime loader behavior change.

## 5. Fast verification workflow

### Quick loader check

Run:

```bash
~/.opencode/bin/opencode --print-logs --log-level INFO stats
```

What to look for:

- a log line showing the wrapper path loading, for example
  `file:///Users/.../.config/opencode/plugins/opencode-mem.js`
- no later error such as:
  - `Path plugin ... must export id`
  - `Plugin export is not a function`

Use this command when you only need to confirm that the plugin loads.

### Persistent Web UI check

Run:

```bash
~/.opencode/bin/opencode . --print-logs --log-level INFO
```

In another shell:

```bash
curl http://127.0.0.1:4747/api/stats
curl http://127.0.0.1:4747/
```

Expected result:

- both endpoints return `200`
- the root page shows the fork header with `Upstream` and `My Fork`

Important lifecycle note:

- the `4747` server only stays up while a live OpenCode project instance is
  still running
- `opencode stats` is short-lived, so it is normal for `4747` to disappear
  immediately after that command exits

## 6. Common failure meanings

### `Path plugin ... must export id`

Meaning:

- the local wrapper is missing `export const id = "opencode-mem"`

### `Plugin export is not a function`

Meaning:

- the wrapper export shape does not match the current loader expectation
- most commonly, the wrapper default-exported the wrong thing

### OpenCode ignores local code changes

Meaning:

- OpenCode may be loading a cached npm copy instead of this repo

Check:

- whether `opencode-mem` is still listed in the `"plugin"` array
- whether logs mention `~/.cache/opencode/node_modules/opencode-mem/`

### `4747` disappears after a successful `stats` run

Meaning:

- usually not a loader bug
- the short-lived OpenCode command already exited and disposed the project instance

### OpenCode starts but CPU is still high

Meaning:

- not necessarily a plugin-loader problem
- the host may be doing its own startup work even if this plugin is disabled

Check:

- whether A/B testing with the local wrapper temporarily disabled changes startup CPU materially
- whether Desktop logs show duplicate skills under multiple directories
- whether MCP servers are failing `prompts/list` during startup

If the CPU spike remains similar with the wrapper disabled, treat that as a host
startup/config investigation first, not a proof that this repo's runtime logic
is still wrong.

## 7. Minimality rule for future agents

If the plugin already works on Windows, do not start by rewriting runtime logic.

Debug in this order:

1. Check which plugin path OpenCode is actually loading.
2. Check whether the local wrapper is ESM-compatible and exports `id`, `OpenCodeMemPlugin`, top-level `server`, and default `{ id, server }`.
3. Check whether `~/.config/opencode/plugins/package.json` exists and contains `{ "type": "module" }`.
4. Check that `opencode-mem` is not duplicated in the npm `"plugin"` array.
5. Check whether the wrapper-loaded build still contains runtime bare `require()` calls or static `bun:` imports under `src/services` or `dist/services`.
6. Check whether the verification command is long-lived enough to keep `4747` alive.
7. Only then consider broader runtime/plugin source changes.

That order preserves cross-platform behavior and avoids unnecessary churn in the
fork.
