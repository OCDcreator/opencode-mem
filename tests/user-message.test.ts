import { describe, expect, it } from "bun:test";

import { extractNonSyntheticUserMessage } from "../src/services/user-message";

describe("extractNonSyntheticUserMessage", () => {
  it("keeps only non-synthetic text parts", () => {
    const message = extractNonSyntheticUserMessage([
      { type: "text", text: "我想修这个自动记忆问题" },
      { type: "text", text: "Please summarize the conversation", synthetic: true },
      { type: "tool" },
      { type: "text", text: "顺便保持中文输出" },
    ]);

    expect(message).toBe("我想修这个自动记忆问题\n顺便保持中文输出");
  });

  it("returns empty string when all text parts are synthetic", () => {
    const message = extractNonSyntheticUserMessage([
      { type: "text", text: "Synthetic English prompt", synthetic: true },
      { type: "tool" },
    ]);

    expect(message).toBe("");
  });
});
