# OpenCode Mem 问题收集

本文档用于收集和跟踪 opencode-mem 插件在实际使用中暴露的问题，便于后续分析和修复。

---

## 问题 1：AI 不主动调用记忆工具进行搜索

**状态：** 部分已修复（工具描述增强已完成；system hook / 语义注入仍待评估）  
**记录时间：** 2026-05-09  
**严重度：** 高（影响核心功能使用）

### 现象

用户多次与 AI 对话时，AI 很少主动调用 `memory` 工具的 `search` 模式去搜索相关记忆。即使用户明确提醒，AI 也常常忽略该工具。

### 原因分析

#### 1.1 工具描述过于被动

`src/index.ts:388` 中的工具描述：

> "Manage and query project memory (MATCH USER LANGUAGE: ...). Use 'search' with technical keywords/tags, 'add' to store knowledge, 'profile' for preferences."

这段描述只是在**介绍功能**，缺少明确的**使用指令**。对比其他 AI 会主动调用的工具（如 `read_file`、`grep`），它们的描述通常包含触发条件：

> "Read a file from the filesystem. **Use this when you need to examine file contents.**"

而 memory 工具缺少类似 "**Use this before answering technical questions**" 的明确提示。

#### 1.2 AI 对工具来源产生误判

AI 最初甚至误以为 `memory` 工具是系统内置的，没有意识到它是 opencode-mem 插件提供的。这说明：

- 工具名称 `memory` 过于通用
- 描述中没有明确标识这是"项目记忆"或"历史上下文"
- AI 无法将工具与插件功能正确关联

#### 1.3 自动注入的记忆产生"已足够"错觉

`chat.message` 钩子（`src/index.ts:328`）会自动注入最近记忆：

```typescript
const listResult = await memoryClient.listMemories(
  tags.project.tag,
  CONFIG.chatMessage.maxMemories  // 默认 3 条
);
```

AI 看到上下文已有 `[MEMORY]...` 块，可能认为"记忆已经有了"。但实际上：

- 这是 `listMemories`（按时间排序的**最近记忆**）
- 不是 `searchMemories`（按语义相似度的**相关记忆**）
- 注入的 3 条记忆可能与当前问题完全无关

#### 1.4 缺少系统级提示

插件未使用 `experimental.chat.system.transform` hook 向 AI 注入使用记忆工具的指令。AI 不知道：

- 自动注入的记忆只是最近几条，不代表最相关
- 它应该主动搜索来获取更相关的历史上下文
- 什么时候应该调用 memory 工具

### 可能的影响

- 用户感觉"记忆系统没用"，因为 AI 从不主动利用历史记忆
- 重复讨论相同问题，浪费 token
- 项目知识无法有效传承

### 修复进展（2026-05-09）

- 已增强 `memory` 工具描述，明确提示 AI 在回答历史技术上下文、项目历史、过去决策、重复问题，以及用户提到"之前/以前/记得/before/previous/remember"等场景时优先使用 `mode="search"`。
- 已在工具描述中说明 `list` 只返回最近记忆，不代表最相关记忆；项目搜索无有效结果时可尝试 `scope="all-projects"` 或替换关键词。
- 已新增 `tests/tool-scope.test.ts` 回归测试，锁定工具描述中的主动搜索提示。
- 尚未启用 `experimental.chat.system.transform`，因为该 hook 需要单独做插件加载兼容验证，避免把行为提示增强和 hook 兼容风险混在同一批修复中。

### 潜在修复方向

1. ✅ **增强工具描述**：已加入明确触发条件和 `list`/`search` 区分
2. ⏳ **使用 system prompt hook**：通过 `experimental.chat.system.transform` 注入使用说明（待兼容性验证）
3. ⏳ **自动注入改用语义搜索**：将 `listMemories` 改为 `searchMemories`，用用户消息作为 query（待单独评估性能和启动影响）
4. ⏳ **工具名称更明确**：如改为 `project_memory` 或 `search_history`，减少 AI 误判（涉及工具名兼容，暂不纳入本批）

---

## 问题 2：AI 调用搜索但搜不到已有记忆

**状态：** 部分已修复（P0 搜索召回与空 tags 修复已完成；scope / 配置时机 / embedding 模型迁移仍待评估）  
**记录时间：** 2026-05-09  
**严重度：** 高（搜索功能失效）

### 现象

用户明确要求 AI 调用 `memory.search` 搜索某内容，AI 也确实执行了搜索，但返回结果为空。然而：

- 用户确认该内容确实存在于记忆中
- Web UI 或数据库中可以看到该记忆
- 搜索却返回 0 条结果

### 根因分析

**经过 @oracle 代码审查，我的初始分析有误。以下是修正后的分析：**

#### 2.1 空 Tags 解析 Bug（核心问题）

`src/services/sqlite/vector-search.ts:170-171`：

```typescript
const memoryTagsStr = row.tags || "";
const memoryTags = memoryTagsStr.split(",").map((t: string) => t.trim().toLowerCase());
```

**问题：** 当记忆没有 tags 时，`row.tags` 为 null/undefined：
- `memoryTagsStr = ""`
- `memoryTags = [""]`（空字符串 split 后得到包含一个空字符串的数组，不是空数组！）

然后在 `vector-search.ts:176`：
```typescript
const matches = queryWords.filter((w) =>
  memoryTags.some((t: string) => t.includes(w) || w.includes(t))
).length;
```

- 任何字符串 `w` 都包含空字符串 `""`（`w.includes("") === true`）
- 所以 `matches = queryWords.length`
- `exactMatchBoost = 1.0`
- `finalTagsSim = Math.max(scores.tagsSim, 1.0) = 1.0`

**这意味着没有 tags 的记忆反而被过度 boost！**
- 实际相似度：`contentSim * 0.6 + 1.0 * 0.4`
- 只需要 `contentSim >= 0.333` 就能通过 0.6 阈值

**但这同时也是一个 bug：** 没有 tags 的记忆不应该获得这么高的 tags 相似度。这会导致搜索结果中混入大量不相关的 tagless 记忆，挤占真正相关的记忆的位置。

#### 2.2 候选召回数量限制（真正导致"搜不到"的原因）

`vector-search.ts:89-102`：

```typescript
contentResults = await backend.search({
  db, shard, kind: "content", queryVector, limit: limit * 4,  // 默认 10 * 4 = 40
});
tagsResults = await backend.search({
  db, shard, kind: "tags", queryVector, limit: limit * 4,  // 默认 40
});
```

**问题：**
- 每个 shard 只召回 `limit * 4` 个候选（默认 40 个）
- 然后在 40 个候选中做相似度计算和过滤
- 如果真正相关的记忆在向量搜索中的排名 > 40，它永远不会被看到
- 当数据库中有大量记忆时，相关记忆很容易落在 40 名之外

**这是导致"明明存在却搜不到"的最直接原因。**

#### 2.3 ContainerTag / Project Scope 不匹配

`src/services/tags.ts:111-123` 的 `getProjectIdentity`：

```typescript
export function getProjectIdentity(directory: string): string {
  const commonDir = getGitCommonDir(directory);
  if (commonDir) {
    return `git-common:${commonDir}`;
  }
  // ...
}
```

**问题：**
- containerTag 基于 git common dir 的绝对路径或 git remote URL
- 如果：
  - 项目被移动到不同路径
  - git worktree 变化
  - 从不同的工作目录启动
- containerTag 会改变，导致旧的记忆在新 scope 下不可见
- 默认 `scope: "project"` 只会搜索当前 containerTag 下的记忆

#### 2.4 项目配置时机问题（潜在严重问题）

`src/index.ts:34-36`：
```typescript
export const OpenCodeMemPlugin: Plugin = async (ctx: PluginInput) => {
  const { directory } = ctx;
  initConfig(directory);  // 在这里初始化配置
```

但 `src/services/client.ts` 和 `src/services/sqlite/shard-manager.ts` 等单例在模块加载时就已经构造完成，它们引用的 `CONFIG` 可能是旧的默认值。

如果项目目录下有 `.opencode/opencode-mem.jsonc` 覆盖了某些配置（如 embedding model、dimensions、storagePath），这些单例可能无法感知到变化。

#### 2.5 Embedding 模型切换问题

`src/services/migration-service.ts:66` 只检测向量维度不匹配，但不检测同维度不同模型的情况。

如果用户切换了 embedding model（比如从 `nomic-embed-text-v1` 换到 `all-MiniLM-L6-v2`，但维度都是 384），系统不会报错，但搜索质量会严重下降。

### 影响评估

- **候选召回限制（2.2）**是最直接导致"搜不到"的原因
- **空 tags 过度 boost（2.1）**导致搜索结果质量下降，无关记忆混入
- **ContainerTag 变化（2.3）**导致项目记忆"丢失"
- **配置时机问题（2.4）**可能导致偶发的、难以复现的搜索失败

### 修复进展（2026-05-09）

- ✅ 已修复空 tags 解析：`null`、空字符串、纯逗号、纯空格 tags 都不会再生成空字符串 tag，也不会触发 exact-match boost。
- ✅ 已扩大候选召回池：内部候选数从 `limit * 4` 改为 `Math.min(Math.max(limit * 20, 100), 1000)`。
- ✅ 已给 `searchInShard` 增加最终返回截断，直接调用该方法的 Web/API 路径不会因为候选池扩大而返回超出请求 `limit` 的结果。
- ✅ 已限制 Web/API 搜索 `pageSize`：无效值回退到 20，最大值限制为 100，避免外部参数放大内部搜索和 prompt 搜索。
- ✅ 已新增 `tests/vector-search-backend-integration.test.ts` 覆盖：空 tags / 纯逗号 tags / 纯空格 tags、主 backend 候选池、fallback backend 候选池、大 limit 上限、最终返回截断。
- ✅ 已通过两轮 `opencode` 审核；第一轮指出候选池无上限和最终截断风险，已修复；第二轮复审确认无残留必须修复 bug。
- ⏳ `ContainerTag / Project Scope`、配置初始化时机、同维度 embedding 模型切换检测仍属于后续数据兼容/迁移问题，未在本批小步修复中改动。

### 修复建议

#### 方案 A：修复空 tags 解析（P0，已完成）

```typescript
// vector-search.ts:171
const memoryTags = memoryTagsStr 
  ? memoryTagsStr.split(",").map((t: string) => t.trim().toLowerCase()).filter(t => t.length > 0)
  : [];
```

#### 方案 B：增加候选召回数量（P0，已完成）

```typescript
// vector-search.ts:94, 101
// 从 limit * 4 改为 limit * 20 或设置最小值
limit: Math.min(Math.max(limit * 20, 100), 1000)
```

同时 `searchInShard` 最终返回会按调用方 `limit` 截断，Web/API 搜索 `pageSize` 最大限制为 100，避免召回扩大带来过量返回或外部参数放大风险。

#### 方案 C：降低默认相似度阈值（P1）

```typescript
// config.ts
similarityThreshold: 0.35  // 从 0.6 降低
```

#### 方案 D：改善项目身份稳定性（P1）

优先使用 git remote URL 而非本地路径作为项目身份：
```typescript
function getProjectIdentity(directory: string): string {
  const gitRepoUrl = getGitRepoUrl(directory);
  if (gitRepoUrl) {
    return `remote:${normalizeGitUrl(gitRepoUrl)}`;  // 归一化 URL
  }
  // fallback 到路径
}
```

#### 方案 E：增加文本搜索 fallback（P2）

当语义搜索无结果时，使用 SQLite LIKE 做文本匹配：
```typescript
async searchMemories(...) {
  // ... 语义搜索 ...
  if (results.length === 0) {
    // Fallback to text search
    const textResults = await textSearchFallback(query, containerTag);
    return { success: true, results: textResults, ... };
  }
}
```

### 相关代码位置

- **空 tags bug：** `src/services/sqlite/vector-search.ts:170-171`
- **候选召回限制：** `src/services/sqlite/vector-search.ts:89-102`
- **搜索入口：** `src/services/client.ts:111` (`searchMemories`)
- **相似度计算：** `src/services/sqlite/vector-search.ts:181-182`
- **相似度阈值配置：** `src/config.ts:122` (`similarityThreshold: 0.6`)
- **ContainerTag 生成：** `src/services/tags.ts:111-167` (`getProjectIdentity`, `getProjectTagInfo`)
- **配置初始化：** `src/index.ts:34-36` (`initConfig`)
- **单例构造时机：** `src/services/client.ts` 模块级别导入，`src/services/sqlite/shard-manager.ts` 模块级别构造

---

## 其他观察

### 插件 hooks 注册

`package.json` 中只注册了两个 hooks：

```json
"hooks": ["chat.message", "event"]
```

缺少 `experimental.chat.system.transform` 等可能增强 AI 行为的 hook。

### 工具返回格式

`memory.search` 返回的格式：

```json
{
  "success": true,
  "query": "...",
  "count": 0,
  "results": []
}
```

当 `count: 0` 时，AI 无法区分是"确实没有相关记忆"还是"搜索出了错"。

---

*本文档将持续更新，随着更多问题的发现和修复进展进行补充。*
