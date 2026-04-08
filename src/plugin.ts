#!/usr/bin/env node
import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";

export const id = "opencode-mem";

export const OpenCodeMemPlugin: Plugin = async (input: PluginInput) => {
  const { OpenCodeMemPlugin: implementation } = await import("./index.js");
  return implementation(input);
};

export default { id, server: OpenCodeMemPlugin } satisfies PluginModule;
