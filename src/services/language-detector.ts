import { franc } from "franc-min";
import { iso6393, iso6393To1 } from "iso-639-3";

const ISO3_TO1_OVERRIDES: Record<string, string> = {
  ara: "ar",
  arb: "ar",
  cmn: "zh",
  kor: "ko",
  jpn: "ja",
  rus: "ru",
  wuu: "zh",
  yue: "zh",
  zho: "zh",
};

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches?.length ?? 0;
}

function sanitizeTextForLanguageDetection(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b[A-Za-z]:[\\/][^\s]+/g, " ")
    .replace(/(?:^|[\s(])(?:\.{1,2}[\\/]|~[\\/]|[\\/])[^\s)]+/g, " ")
    .replace(/[A-Za-z0-9_.-]+[\\/][A-Za-z0-9_.\\/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectByScript(text: string): string | null {
  if (countMatches(text, /[\p{Script=Hiragana}\p{Script=Katakana}]/gu) >= 2) {
    return "ja";
  }

  if (countMatches(text, /\p{Script=Hangul}/gu) >= 2) {
    return "ko";
  }

  if (countMatches(text, /\p{Script=Han}/gu) >= 2) {
    return "zh";
  }

  if (countMatches(text, /\p{Script=Cyrillic}/gu) >= 2) {
    return "ru";
  }

  if (countMatches(text, /\p{Script=Arabic}/gu) >= 2) {
    return "ar";
  }

  return null;
}

export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) {
    return "en";
  }

  const sanitized = sanitizeTextForLanguageDetection(text);
  const candidate = sanitized || text;
  const scriptGuess = detectByScript(candidate);
  if (scriptGuess) {
    return scriptGuess;
  }

  const detected = franc(candidate, { minLength: 10 });

  if (detected === "und") {
    return "en";
  }

  return ISO3_TO1_OVERRIDES[detected] || iso6393To1[detected] || "en";
}

export function getLanguageName(code: string): string {
  const lang = iso6393.find((l: any) => l.iso6391 === code);
  return lang?.name || "English";
}
