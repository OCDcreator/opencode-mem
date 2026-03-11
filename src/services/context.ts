import { CONFIG } from "../config.js";
import { getUserProfileContext } from "./user-profile/profile-context.js";

interface MemoryResultMinimal {
  similarity: number;
  memory?: string;
  chunk?: string;
}

interface MemoriesResponseMinimal {
  results?: MemoryResultMinimal[];
}

export function formatContextForPrompt(
  userId: string | null,
  projectMemories: MemoriesResponseMinimal
): string {
  const parts: string[] = [
    "[MEMORY]",
    "",
    "> [!info] 历史记忆上下文",
    "> 以下内容是从历史对话中**自动提取并注入**的记忆，作为背景参考。",
    "> 这些记忆**可能与当前对话相关，也可能无关**。请根据用户实际需求判断是否参考。",
    "> 如果与当前任务无关，请直接忽略。",
    "",
  ];

  if (CONFIG.injectProfile && userId) {
    const profileContext = getUserProfileContext(userId);
    if (profileContext) {
      parts.push("## 用户画像\n");
      parts.push(profileContext);
      parts.push("");
    }
  }

  const projectResults = projectMemories.results || [];
  if (projectResults.length > 0) {
    parts.push("## 项目知识\n");
    projectResults.forEach((mem) => {
      const similarity = Math.round(mem.similarity * 100);
      const content = mem.memory || mem.chunk || "";
      parts.push(`- [${similarity}% 相关度] ${content}`);
    });
    parts.push("");
  }

  const hasOnlyHeader = parts.length === 8;
  if (hasOnlyHeader) {
    return "";
  }

  parts.push("[/MEMORY]");
  parts.push("");

  return parts.join("\n");
}
