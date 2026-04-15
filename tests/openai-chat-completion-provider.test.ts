import { afterEach, describe, expect, it } from "bun:test";
import { OpenAIChatCompletionProvider } from "../src/services/ai/providers/openai-chat-completion.js";
import type { AIMessage } from "../src/services/ai/session/session-types.js";
import type { ChatCompletionTool } from "../src/services/ai/tools/tool-schema.js";

const toolSchema: ChatCompletionTool = {
  type: "function",
  function: {
    name: "save_memories",
    description: "Save memories",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

class FakeSessionManager {
  private readonly session = { id: "session-1" };
  private readonly messages: any[] = [];

  getSession(): null {
    return null;
  }

  createSession(): { id: string } {
    return this.session;
  }

  getMessages(): any[] {
    return this.messages;
  }

  getLastSequence(): number {
    return this.messages.length - 1;
  }

  addMessage(message: any): void {
    this.messages.push(message);
  }
}

class TestableOpenAIChatCompletionProvider extends OpenAIChatCompletionProvider {
  filterMessages(messages: AIMessage[]): AIMessage[] {
    return this.filterIncompleteToolCallSequences(messages);
  }
}

function makeProvider(config: Record<string, unknown> = {}) {
  return new OpenAIChatCompletionProvider(
    {
      model: "gpt-4o-mini",
      apiUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      ...config,
    },
    new FakeSessionManager() as any
  );
}

function makeTestableProvider(config: Record<string, unknown> = {}) {
  return new TestableOpenAIChatCompletionProvider(
    {
      model: "gpt-4o-mini",
      apiUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      ...config,
    },
    new FakeSessionManager() as any
  );
}

function makeFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
}) {
  const textBody =
    typeof response.body === "string" ? response.body : JSON.stringify(response.body ?? "error");
  const jsonBody = typeof response.body === "string" ? {} : (response.body ?? {});

  return (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return {
      ok: response.ok ?? false,
      status: response.status ?? 400,
      statusText: response.statusText ?? "Bad Request",
      text: async () => textBody,
      json: async () => jsonBody,
    } as Response;
  }) as typeof fetch;
}

describe("OpenAIChatCompletionProvider", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps complete tool call sequences", () => {
    const messages: AIMessage[] = [
      {
        aiSessionId: "session-1",
        sequence: 0,
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "save_memories", arguments: "{}" },
          },
        ],
        createdAt: 1,
      },
      {
        aiSessionId: "session-1",
        sequence: 1,
        role: "tool",
        content: '{"success":true}',
        toolCallId: "call-1",
        createdAt: 2,
      },
    ];

    expect(makeTestableProvider().filterMessages(messages)).toEqual(messages);
  });

  it("drops trailing incomplete tool call sequences", () => {
    const messages: AIMessage[] = [
      {
        aiSessionId: "session-1",
        sequence: 0,
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "save_memories", arguments: "{}" },
          },
        ],
        createdAt: 1,
      },
    ];

    expect(makeTestableProvider().filterMessages(messages)).toEqual([]);
  });

  it("accepts null assistant content when tool calls exist", async () => {
    const validArguments = JSON.stringify({
      preferences: [],
      patterns: [],
      workflows: [],
      codingStyle: {},
      domainKnowledge: [],
    });

    globalThis.fetch = makeFetch({
      ok: true,
      body: {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "save_memories", arguments: validArguments },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await makeProvider().executeToolCall("system", "user", toolSchema, "session-id");

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
  });

  it("rejects responses with empty choices", async () => {
    globalThis.fetch = makeFetch({ ok: true, body: { choices: [] } });

    const result = await makeProvider().executeToolCall("system", "user", toolSchema, "session-id");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid API response format");
  });
});
