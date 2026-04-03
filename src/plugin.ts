#!/usr/bin/env node
import type { PluginModule } from "@opencode-ai/plugin";
const { OpenCodeMemPlugin } = await import("./index.js");
export { OpenCodeMemPlugin };
export default { server: OpenCodeMemPlugin } satisfies PluginModule;
