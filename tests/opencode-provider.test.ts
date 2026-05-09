import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  createV2Client,
  generateStructuredOutput,
  getV2Client,
  isProviderConnected,
  setConnectedProviders,
  setV2Client,
} from "../src/services/ai/opencode-provider.js";

const schema = z.object({
  topic: z.string(),
  count: z.number(),
});

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function installFetchMock(responder: (call: FetchCall) => { status?: number; body: unknown }): {
  calls: FetchCall[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req =
      input instanceof Request
        ? input
        : new Request(typeof input === "string" ? input : input.toString(), init);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
    }

    const call: FetchCall = {
      url: req.url,
      method: req.method.toUpperCase(),
      headers,
      body,
    };
    calls.push(call);
    const { status = 200, body: respBody } = responder(call);
    return new Response(JSON.stringify(respBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

describe("connected providers state", () => {
  afterEach(() => {
    setConnectedProviders([]);
  });

  it("normalizes provider list objects from opencode provider.list", () => {
    setConnectedProviders([{ id: "anthropic" }, { name: "github-copilot" }, "openai"]);
    expect(isProviderConnected("anthropic")).toBe(true);
    expect(isProviderConnected("github-copilot")).toBe(true);
    expect(isProviderConnected("openai")).toBe(true);
    expect(isProviderConnected("gemini")).toBe(false);
  });
});

describe("v2 client cache", () => {
  afterEach(() => {
    setV2Client(undefined);
  });

  it("setV2Client + getV2Client roundtrip", () => {
    const client = createV2Client("http://127.0.0.1:9999");
    setV2Client(client);
    expect(getV2Client()).toBe(client);
  });

  it("createV2Client accepts URL objects", () => {
    const client = createV2Client(new URL("http://127.0.0.1:9999"));
    expect(client).toBeDefined();
    expect(typeof client.session.create).toBe("function");
    expect(typeof client.session.prompt).toBe("function");
    expect(typeof client.session.delete).toBe("function");
  });
});

describe("generateStructuredOutput via opencode v2", () => {
  let mock: ReturnType<typeof installFetchMock> | undefined;

  beforeEach(() => {
    mock = undefined;
    setConnectedProviders([]);
    setV2Client(undefined);
  });

  afterEach(() => {
    mock?.restore();
    setConnectedProviders([]);
    setV2Client(undefined);
  });

  it("posts schema to session.prompt and returns parsed structured output", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: { id: "ses_test_1" } };
      }
      if (call.method === "POST" && call.url.includes("/session/ses_test_1/message")) {
        return {
          body: {
            info: { structured: { topic: "auth", count: 3 } },
            parts: [],
          },
        };
      }
      if (call.method === "DELETE" && call.url.endsWith("/session/ses_test_1")) {
        return { body: true };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    const client = createV2Client("http://127.0.0.1:9999");
    const result = await generateStructuredOutput({
      client,
      providerID: "github-copilot",
      modelID: "gpt-4o-mini",
      systemPrompt: "system",
      userPrompt: "user",
      schema,
    });

    expect(result).toEqual({ topic: "auth", count: 3 });

    const promptCall = mock.calls.find((c) => c.url.includes("/session/ses_test_1/message"));
    expect(promptCall).toBeDefined();
    const promptBody = promptCall!.body as Record<string, unknown>;
    expect(promptBody.model).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-4o-mini",
    });
    expect(promptBody.system).toBe("system");
    expect(promptBody.noReply).toBe(true);
    const format = promptBody.format as Record<string, unknown>;
    expect(format.type).toBe("json_schema");
    expect(format.schema).toBeDefined();

    const deleteCall = mock.calls.find((c) => c.method === "DELETE");
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.url.endsWith("/session/ses_test_1")).toBe(true);
  });

  it("uses cached v2 client for the fork's providerName/modelId call shape when connected", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: { id: "ses_cached" } };
      }
      if (call.method === "POST" && call.url.includes("/session/ses_cached/message")) {
        return {
          body: {
            info: { structured: { topic: "cached", count: 7 } },
            parts: [],
          },
        };
      }
      if (call.method === "DELETE") {
        return { body: true };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    setConnectedProviders(["github-copilot"]);
    setV2Client(createV2Client("http://127.0.0.1:9999"));

    const result = await generateStructuredOutput({
      providerName: "github-copilot",
      modelId: "gpt-4o-mini",
      systemPrompt: "system",
      userPrompt: "user",
      schema,
      temperature: 0.3,
    });

    expect(result).toEqual({ topic: "cached", count: 7 });
    const promptCall = mock.calls.find((c) => c.url.includes("/session/ses_cached/message"));
    const promptBody = promptCall!.body as Record<string, unknown>;
    expect(promptBody.model).toEqual({
      providerID: "github-copilot",
      modelID: "gpt-4o-mini",
    });
  });

  it("rejects when info.error is present and still deletes the transient session", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: { id: "ses_err" } };
      }
      if (call.method === "POST" && call.url.includes("/session/ses_err/message")) {
        return {
          body: {
            info: {
              error: {
                name: "StructuredOutputError",
                data: { message: "schema validation failed" },
              },
            },
            parts: [],
          },
        };
      }
      if (call.method === "DELETE") {
        return { body: true };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    const client = createV2Client("http://127.0.0.1:9999");
    await expect(
      generateStructuredOutput({
        client,
        providerID: "anthropic",
        modelID: "claude-haiku-4-5",
        systemPrompt: "s",
        userPrompt: "u",
        schema,
      })
    ).rejects.toThrow(/StructuredOutputError/);

    expect(mock.calls.find((c) => c.method === "DELETE")).toBeDefined();
  });

  it("rejects when info.structured is missing", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: { id: "ses_empty" } };
      }
      if (call.method === "POST" && call.url.includes("/session/ses_empty/message")) {
        return { body: { info: {}, parts: [] } };
      }
      if (call.method === "DELETE") {
        return { body: true };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    const client = createV2Client("http://127.0.0.1:9999");
    await expect(
      generateStructuredOutput({
        client,
        providerID: "github-copilot",
        modelID: "gpt-4o-mini",
        systemPrompt: "s",
        userPrompt: "u",
        schema,
      })
    ).rejects.toThrow(/no structured output/);
  });

  it("rejects when session.create returns no id", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: {} };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    const client = createV2Client("http://127.0.0.1:9999");
    await expect(
      generateStructuredOutput({
        client,
        providerID: "anthropic",
        modelID: "claude-haiku-4-5",
        systemPrompt: "s",
        userPrompt: "u",
        schema,
      })
    ).rejects.toThrow(/session\.create returned no session id/);
  });

  it("forwards retryCount inside format when provided", async () => {
    mock = installFetchMock((call) => {
      if (call.method === "POST" && call.url.endsWith("/session")) {
        return { body: { id: "ses_retry" } };
      }
      if (call.method === "POST" && call.url.includes("/session/ses_retry/message")) {
        return {
          body: {
            info: { structured: { topic: "x", count: 1 } },
            parts: [],
          },
        };
      }
      if (call.method === "DELETE") {
        return { body: true };
      }
      throw new Error(`unexpected fetch: ${call.method} ${call.url}`);
    });

    const client = createV2Client("http://127.0.0.1:9999");
    await generateStructuredOutput({
      client,
      providerID: "github-copilot",
      modelID: "gpt-4o-mini",
      systemPrompt: "s",
      userPrompt: "u",
      schema,
      retryCount: 2,
    });

    const promptCall = mock.calls.find((c) => c.url.includes("/session/ses_retry/message"));
    const format = (promptCall!.body as Record<string, unknown>).format as
      | Record<string, unknown>
      | undefined;
    expect(format?.retryCount).toBe(2);
  });
});
