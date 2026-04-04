export interface PromptTextPartLike {
  type?: string;
  text?: string;
  synthetic?: boolean;
}

export function extractNonSyntheticUserMessage(
  parts: ReadonlyArray<PromptTextPartLike> | null | undefined
): string {
  if (!parts || parts.length === 0) {
    return "";
  }

  const textParts = parts.filter(
    (part): part is PromptTextPartLike & { type: "text"; text: string } =>
      part.type === "text" && typeof part.text === "string" && part.synthetic !== true
  );

  if (textParts.length === 0) {
    return "";
  }

  return textParts
    .map((part) => part.text)
    .join("\n")
    .trim();
}
