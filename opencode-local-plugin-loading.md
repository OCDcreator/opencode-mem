# OpenCode Local Plugin Loading Playbook

This note records the exact local loading path that was verified on this
machine against the real OpenCode source, not guessed from memory.

It is intended for future maintainers and coding agents who need to answer one
question quickly:

> How do I make `opencode-mem` load normally inside OpenCode without breaking
> the Windows-friendly fork behavior?

## 1. Source-verified loader rules

Source-of-truth OpenCode repo on this machine:

- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/opencode`

Key facts confirmed from that source:

1. Local plugins are auto-loaded from:
   - `~/.config/opencode/plugins/`
   - `.opencode/plugins/`
2. OpenCode scans `{plugin,plugins}/*.{ts,js}` in those directories.
3. Path plugins must export `id`.
4. Server plugins must default export an object with `server()`.
5. Local plugins and npm plugins can both load, so duplicate configuration can
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

Canonical wrapper pattern:

```js
import { pathToFileURL } from "node:url";

const entryUrl = pathToFileURL("/absolute/path/to/opencode-mem/dist/index.js").href;
const { OpenCodeMemPlugin } = await import(entryUrl);

export const id = "opencode-mem";

export default {
  id,
  server: OpenCodeMemPlugin,
};
```

Notes:

- `id` is required for path plugins.
- The default export must be an object, not a bare plugin function.
- The object must expose `server`, because this is a server plugin.

### macOS example

```js
import { pathToFileURL } from "node:url";

const entryUrl = pathToFileURL(
  "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencode-mem/dist/index.js"
).href;
const { OpenCodeMemPlugin } = await import(entryUrl);

export const id = "opencode-mem";

export default {
  id,
  server: OpenCodeMemPlugin,
};
```

### Windows example

```js
import { pathToFileURL } from "node:url";

const entryUrl = pathToFileURL(
  "C:/Users/lt/Desktop/Write/custom-project/opencode-mem/dist/index.js"
).href;
const { OpenCodeMemPlugin } = await import(entryUrl);

export const id = "opencode-mem";

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

## 7. Minimality rule for future agents

If the plugin already works on Windows, do not start by rewriting runtime logic.

Debug in this order:

1. Check which plugin path OpenCode is actually loading.
2. Check whether the local wrapper exports `id` and default `{ id, server }`.
3. Check that `opencode-mem` is not duplicated in the npm `"plugin"` array.
4. Check whether the verification command is long-lived enough to keep `4747` alive.
5. Only then consider runtime/plugin source changes.

That order preserves cross-platform behavior and avoids unnecessary churn in the
fork.
