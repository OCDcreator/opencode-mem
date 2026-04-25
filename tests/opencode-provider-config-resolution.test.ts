import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  generateStructuredOutput,
  setConfigPath,
  setStatePath,
} from "../src/services/ai/opencode-provider.js";

const originalFetch = globalThis.fetch;

describe("opencode provider config resolution", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    setConfigPath("");
    setStatePath("");
  });

  it("ignores plugin file URLs when resolving provider config", async () => {
    const baseDir = mkdtempSync(join(tmpdir(), "opencode-mem-provider-config-"));
    const pluginDir = join(baseDir, "plugins", "superpowers");
    mkdirSync(pluginDir, { recursive: true });

    writeFileSync(
      join(baseDir, "opencode.json"),
      JSON.stringify({
        plugin: [`file://${pluginDir.replace(/\\/g, "/")}`],
        provider: {
          "opencode-go": {
            npm: "@ai-sdk/openai-compatible",
            options: {
              baseURL: "https://example.test/v1",
              apiKey: "test-key",
            },
            models: {
              "deepseek-v4-flash": {
                name: "deepseek-v4-flash",
              },
            },
          },
        },
      }),
      "utf-8"
    );

    setConfigPath(baseDir);

    globalThis.fetch = (async () =>
      ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ answer: "ok" }),
              },
            },
          ],
        }),
      }) as Response) as typeof fetch;

    const result = await generateStructuredOutput({
      providerName: "opencode-go",
      modelId: "deepseek-v4-flash",
      systemPrompt: "Return JSON",
      userPrompt: "Say ok",
      schema: z.object({ answer: z.string() }),
    });

    expect(result).toEqual({ answer: "ok" });

    rmSync(baseDir, { recursive: true, force: true });
  });
});
