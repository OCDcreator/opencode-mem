import { describe, expect, it } from "bun:test";

import { detectLanguage, getLanguageName } from "../src/services/language-detector";

describe("detectLanguage", () => {
  it("maps Chinese prompts to zh", () => {
    expect(detectLanguage("插件集成TUI界面方案探讨")).toBe("zh");
  });

  it("detects short Chinese prompts with 5+ chars", () => {
    expect(detectLanguage("这是中文测试")).toBe("zh");
  });

  it("ignores Windows paths before detecting the prompt language", () => {
    const text = `C:\\Users\\lt\\Desktop\\Write\\custom-project\\opencodian\\reference-projects\\opencode
我能在目前的插件集成这种tui模式吗？就是在插件界面展示tui界面`;

    expect(detectLanguage(text)).toBe("zh");
  });

  it("keeps Cyrillic prompts as Russian", () => {
    expect(detectLanguage("Почему последняя память записалась по-русски?")).toBe("ru");
  });

  it("keeps English prompts as English", () => {
    expect(detectLanguage("This is an English test")).toBe("en");
  });

  it("falls back to English for empty input", () => {
    expect(detectLanguage("")).toBe("en");
  });

  it("falls back to English for whitespace only", () => {
    expect(detectLanguage("   ")).toBe("en");
  });

  it("falls back to English for undetectable short input", () => {
    expect(detectLanguage("ab")).toBe("en");
  });
});

describe("getLanguageName", () => {
  it("supports 3-letter ISO lookups from upstream-compatible fallbacks", () => {
    expect(getLanguageName("cmn").toLowerCase()).toContain("chinese");
  });

  it("resolves standard 2-letter codes", () => {
    expect(getLanguageName("zh").toLowerCase()).toContain("chinese");
    expect(getLanguageName("en").toLowerCase()).toContain("english");
  });

  it("falls back to English for unknown codes", () => {
    expect(getLanguageName("xyz")).toBe("English");
  });
});
