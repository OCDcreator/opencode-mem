import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG } from "../src/config.js";

const embeddingUrl = new URL("../src/services/embedding.js", import.meta.url).href;
const originalConfig = { ...CONFIG };

afterEach(() => {
  mock.restore();
  for (const key of Object.keys(CONFIG)) {
    if (!(key in originalConfig)) {
      delete (CONFIG as Record<string, unknown>)[key];
    }
  }
  Object.assign(CONFIG, originalConfig);
});

describe("EmbeddingService transformers runtime options", () => {
  it("forces quantized dtype and disables ONNX wasm threading for local embeddings", async () => {
    const storagePath = mkdtempSync(join(tmpdir(), "opencode-mem-embedding-"));
    const pipelineCalls: unknown[][] = [];
    const transformersEnv = {
      allowLocalModels: false,
      allowRemoteModels: false,
      cacheDir: "",
      backends: {
        onnx: {
          wasm: {
            numThreads: 4,
          },
        },
      },
    };

    Object.assign(CONFIG, {
      embeddingApiUrl: undefined,
      embeddingApiKey: undefined,
      embeddingModel: "Xenova/nomic-embed-text-v1",
      storagePath,
    });

    mock.module("@huggingface/transformers", () => ({
      env: transformersEnv,
      pipeline: async (...args: unknown[]) => {
        pipelineCalls.push(args);
        return async () => ({ data: [0, 1, 2] });
      },
    }));

    try {
      const { EmbeddingService } = await import(`${embeddingUrl}?case=${Date.now()}`);
      const service = new EmbeddingService();

      await service.warmup();

      expect(transformersEnv.backends.onnx.wasm.numThreads).toBe(1);
      expect(transformersEnv.allowLocalModels).toBe(true);
      expect(transformersEnv.allowRemoteModels).toBe(true);
      expect(transformersEnv.cacheDir).toBe(join(storagePath, ".cache"));
      expect(pipelineCalls).toHaveLength(1);
      expect(pipelineCalls[0]?.[0]).toBe("feature-extraction");
      expect(pipelineCalls[0]?.[1]).toBe("Xenova/nomic-embed-text-v1");
      expect(pipelineCalls[0]?.[2]).toMatchObject({ dtype: "q8" });
    } finally {
      rmSync(storagePath, { recursive: true, force: true });
    }
  });
});
