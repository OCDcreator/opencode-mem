#!/usr/bin/env node
import type { Plugin, PluginInput, PluginModule } from "@opencode-ai/plugin";

export const id = "opencode-mem";

function formatStartupErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  const missingEnvMatch = rawMessage.match(/Environment variable not found: ([A-Z0-9_]+)/i);
  if (missingEnvMatch) {
    return `Startup failed: missing environment variable \`${missingEnvMatch[1]}\`. Check \`~/.config/opencode/opencode-mem.jsonc\` or project \`.opencode/opencode-mem.jsonc\`.`;
  }

  if (rawMessage.includes("Secret file not found:")) {
    return `Startup failed: configured secret file was not found. Check \`~/.config/opencode/opencode-mem.jsonc\` or project \`.opencode/opencode-mem.jsonc\`.`;
  }

  if (rawMessage.includes("Failed to read secret file")) {
    return `Startup failed: configured secret file could not be read. Check the file path and permissions.`;
  }

  return `Startup failed: ${rawMessage}`;
}

function createStartupFailureHooks(input: PluginInput, error: unknown) {
  let notified = false;

  const notifyOnce = async () => {
    if (notified || !input.client?.tui) {
      return;
    }

    notified = true;

    await input.client.tui
      .showToast({
        body: {
          title: "Memory Explorer Error",
          message: formatStartupErrorMessage(error),
          variant: "error",
          duration: 8000,
        },
      })
      .catch(() => {});
  };

  void notifyOnce();

  return {
    "chat.message": async () => {
      await notifyOnce();
    },
    event: async () => {
      await notifyOnce();
    },
  };
}

export const OpenCodeMemPlugin: Plugin = async (input: PluginInput) => {
  try {
    const { OpenCodeMemPlugin: implementation } = await import("./index.js");
    return implementation(input);
  } catch (error) {
    if (!input.client?.tui) {
      throw error;
    }

    return createStartupFailureHooks(input, error);
  }
};

export default { id, server: OpenCodeMemPlugin } satisfies PluginModule;
