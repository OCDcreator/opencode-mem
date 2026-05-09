# 上游与 Fork 功能实现逻辑差异分析报告

> **生成日期**: 2026-05-09
> **Fork 仓库**: `OCDcreator/opencode-mem` @ `455cd10`
> **上游仓库**: `tickernelz/opencode-mem` @ `a06a200` (upstream/main)
> **共祖提交**: `e391f4d` (`fix: respect autoCaptureEnabled config in session.idle handler`)
> **Fork 版本**: `2.14.1` | **上游版本**: `2.14.0`
> **比较范围**: Fork 34 commits / 上游 23 commits 自共祖以来的各自独有提交

---

## 总览

本报告聚焦 **功能实现逻辑差异**，排除纯文档、测试和格式化变化。共分析 8 个核心维度，覆盖全部有差异的源文件。

### 差异性质分类

| 分类 | 含义 | 标记 |
|------|------|------|
| **有意保留** | Fork 刻意为之的行为差异，通常为兼容性/健壮性增强 | 🟢 有意保留 |
| **Bug 修复** | Fork 修复了上游存在的实际缺陷 | 🔵 Bug 修复 |
| **需评估同步** | 上游的改进可能值得合并回 Fork，或 Fork 的改动值得向上游 PR | 🟡 需评估同步 |
| **潜在风险** | 差异可能引入新的维护负担或兼容性问题 | 🔴 潜在风险 |

### 无差异的服务

以下服务在两侧完全一致，无需关注：
- `secret-resolver.ts`、`jsonc.ts`、`client.ts`
- `migration-service.ts`、`deduplication-service.ts`、`cleanup-service.ts`
- `privacy.ts`、`web-server-worker.ts`
- `src/services/user-profile/` 全部文件
- `src/services/ai/` 下的 `provider-config.ts`、`ai-provider-factory.ts`
- `src/services/ai/providers/openai-chat-completion.ts`

---

## 1. 插件加载与导出

**涉及文件**: `src/plugin.ts`

### 上游做法

精简的 re-exporter（约 11 行）。通过 ESM 静态 `import pkg from "package.json"` 获取包名，动态导入 `./index.js`，同步导出 `id` 和 `OpenCodeMemPlugin`。如果 `./index.js` 加载失败，整个插件直接崩溃，无任何降级处理。

### Fork 做法

防御性包装器（约 85 行），核心变更：

1. **包名获取**：用 `readFileSync` 替代 ESM 静态导入，避免某些 ESM 环境下的 JSON import 兼容问题
2. **优雅降级**：`OpenCodeMemPlugin` 是一个包装器，捕获 `import("./index.js")` 的错误。如果失败：
   - 调用 `createStartupFailureHooks()` 生成带错误信息的 Toast 通知
   - 如果 `client?.tui` 可用，插件存活并持续显示错误信息
   - 如果 TUI 不可用，重新抛出异常
3. **重复通知**：错误钩子装饰在 `chat.message` 和 `event` 上，确保用户能看到启动失败信息
4. **default export**：额外导出 `{ id, server: OpenCodeMemPlugin }` 作为默认导出

### 差异影响

| 方面 | 影响 |
|------|------|
| 启动弹性 | 上游在依赖缺失/配置错误时完全不可用；Fork 优雅降级并通知用户 |
| 调试体验 | Fork 在 TUI 中显示具体的配置/密钥文件错误指导 |

### 维护风险/同步建议

- 🟢 **有意保留** — 生产环境必要的防御性工程
- 🟡 **可考虑向上游 PR** — `createStartupFailureHooks()` 模式对上游用户也有价值，建议以独立 PR 形式贡献

---

## 2. 配置与 Secret 解析

**涉及文件**: `src/config.ts`、`package.json`

### 上游做法

- `resolveSecretValue()` 在 `buildConfig()` 中直接内联调用，解析失败时抛出异常
- `isConfigured()` 始终返回 `true`（无自检机制）
- 无嵌入密钥验证（`embeddingApiUrl` 有值但 `embeddingApiKey` 为空时静默继续）
- `@opencode-ai/sdk` 版本 `^1.3.0`
- 构建脚本：内联 Unix shell 命令 `mkdir -p dist/web && cp -r src/web/* dist/web/`

### Fork 做法

1. **错误捕获包装**：`resolveSecretSetting()` 包装 `resolveSecretValue()`，通过 try-catch 捕获错误，记录到 `_configStartupErrors[]` 数组，返回 `undefined` 而非抛出异常
2. **嵌入密钥验证**：当 `embeddingApiUrl` 已配置但 `embeddingApiKey` 解析失败/缺失时，生成明确的配置错误条目
3. **就绪检测**：`isConfigured()` 返回 `_configStartupErrors.length === 0`
4. **诊断接口**：新增 `getConfigStartupErrors()` 导出，供 `plugin.ts` 和 `index.ts` 报告配置问题
5. **SDK 版本锁定**：`@opencode-ai/sdk` 升级至 `^1.14.41`
6. **跨平台构建**：`scripts/build.mjs` 替代内联 shell 命令，使用 `node:fs` 的 `cpSync` + `rmSync`

### 差异影响

| 方面 | 影响 |
|------|------|
| 启动容错 | 上游：损坏的密钥导致未捕获异常，可能使整个 `initConfig()` 崩溃。Fork：错误被记录，配置值变为 `undefined`，插件仍可运行 |
| 就绪自检 | 上游总是报告"已配置"。Fork 在配置有误时正确报告"未配置" |
| SDK 兼容性 | Fork 锁定更高 SDK 版本，可能依赖 1.3→1.14 之间引入的新 API |

### 维护风险/同步建议

- 🟢 **有意保留** — 配置错误诊断和跨平台构建
- 🟡 **需评估同步** — `_configStartupErrors` 和 `getConfigStartupErrors()` 模式可向上游贡献
- 🔴 **潜在风险** — SDK 版本 `^1.14.41` 与上游 `^1.3.0` 差距大，需要确认 Fork 实际使用了哪些 1.3 之后的 API；如果上游也升级 SDK，合并时需仔细验证
- 🟡 **需评估同步** — 上游已合并 `@huggingface/transformers` 迁移（`40508eb`），Fork 也已吸收（`ee765aa`），但具体实现路径可能不同，下次同步需验证

---

## 3. 记忆注入与工具行为

**涉及文件**: `src/index.ts`（工具部分）、`src/services/context.ts`、`src/services/user-message.ts`（新增）

### 上游做法

- **工具描述**：通用 `"Manage and query project memory..."`
- **热身门禁**：硬门禁 — 工具执行开始时检查 `memoryClient.isReady()`，未就绪则返回 `{success: false}` 阻止所有操作
- **上下文格式**：简单的 `[MEMORY]` 标头 + 用户画像 + 项目记忆列表（`[N%]` 标签），无闭合标记
- **消息提取**：内联 `output.parts.filter(...)` 过滤文本类型

### Fork 做法

1. **工具描述增强**：详细描述包含何时搜索的具体提示、中文示例短语（"以前"、"之前"、"记得"）、重试策略（`scope='all-projects'`）以及搜索与列表的语义差异说明
2. **按需热身**：移除硬门禁，改为在 `add` 和 `search` 操作中按需 `await memoryClient.warmup()`；`list`/`profile`/`forget`/`help` 不触发热身
3. **帮助参数**：`search` 新增 `scope?` 参数，`list` 新增 `scope?` 参数
4. **上下文格式重构**：
   - 插入中文引用块标头，说明记忆的性质和使用指引
   - 用户画像和项目知识各有 `##` 标题
   - `[N%]` 改为 `[N% 相关度]`
   - 末尾追加 `[/MEMORY]` 闭合标记
   - 空检查从 `parts.length === 1` 改为 `parts.length === 8`（硬编码魔法数字）
5. **消息过滤提取**：新增 `user-message.ts`，`extractNonSyntheticUserMessage()` 过滤 `synthetic !== true` 的部分

### 差异影响

| 方面 | 影响 |
|------|------|
| 首次使用体验 | 上游在嵌入模型加载完成前（~70秒）阻止所有工具使用。Fork 允许立即使用非搜索功能，搜索按需等待 |
| LLM 指引质量 | Fork 的工具描述显著更详细，能更好引导 LLM 正确使用记忆工具 |
| 记忆注入格式 | Fork 的中文引用块 + 闭合标记提供了更好的 LLM 上下文边界识别 |
| 合成消息过滤 | Fork 排除系统/上下文注入的合成文本，避免将非用户内容作为记忆提取源 |

### 维护风险/同步建议

- 🟢 **有意保留** — 工具描述增强、按需热身、中文上下文格式
- 🔴 **潜在风险** — `context.ts` 中 `parts.length === 8` 是硬编码魔法数字。如果中文标头格式改变（增加/减少行数），空检查逻辑会静默失效。建议添加注释说明 8 的来源
- 🟡 **需评估同步** — 按需热身模式解决了"启动时卡住"的真实痛点，值得向上游 PR
- 🟡 **需评估同步** — 合成消息过滤（`user-message.ts`）是行为改进，上游可能也存在将系统注入误作用户内容的问题

---

## 4. 搜索/向量/SQLite

**涉及文件**: `src/services/sqlite/vector-search.ts`、`src/services/sqlite/sqlite-bootstrap.ts`、`src/services/sqlite/shard-manager.ts`、`src/services/embedding.ts`

### 上游做法

- **搜索候选**：`limit * 4` 倍率，无上限。当 `limit=1000` 时，获取 4000 个候选
- **结果返回**：`return hydratedResults` — **返回全部水合后的候选**，不截断到 `limit`
- **空标签处理**：`"".split(",")` 返回 `[""]`（含空字符串的数组），导致无标签记忆被错误匹配 `exactMatchBoost` 查询
- **SQLite**：硬依赖 `bun:sqlite`，通过模块级 `require("bun:sqlite")` 加载
- **嵌入服务**：模块级 `_transformers` 单例，`withTimeout` 使用 `Promise.race`（定时器不清理，可能阻止进程退出）

### Fork 做法

1. **候选限制函数**：
   - `MIN_SEARCH_CANDIDATES=100`、`SEARCH_CANDIDATE_MULTIPLIER=20`、`MAX_SEARCH_CANDIDATES=1000`
   - `getSearchCandidateLimit(limit)`：`clamp(limit * 20, 100, 1000)`
   - 对小 limit 召回更多候选（limit=5 → 100 vs 上游 20），对大 limit 封顶（1000 vs 上游无上限）
2. **结果截断**：`return hydratedResults.slice(0, resultLimit)` — **修复了上游返回全部结果的 bug**
3. **空标签修复**：添加真值检查 + 过滤零长度条目，`[""]` 变为 `[]`
4. **SQLite 双层回退**：
   - 优先 `bun:sqlite`（Bun 运行时）
   - 失败后尝试 `node:sqlite`（Node.js 22+ 内置）
   - `DatabaseSync` 适配器类匹配 `bun:sqlite.Database` 接口
   - `normalizeParams()` 处理参数数组扁平化差异
5. **嵌入服务重构**：
   - transformers 加载移至实例方法 `getTransformers()`，带每实例 Promise 缓存
   - `withTimeout` 改写：显式 `clearTimeout` + `timeout.unref?.()`
   - 移除了 WASM/ONNX 挂起的解释性注释（行为不变）

### 差异影响

| 方面 | 影响 |
|------|------|
| 搜索正确性 | 🔴 **上游有 bug** — `return hydratedResults` 未截断，可能返回数千条结果。Fork 已修复 |
| 候选池控制 | 上游无上限（4x 倍率），对大 limit 场景存在内存/性能风险。Fork 封顶 1000 |
| 空标签匹配 | 上游空标签匹配会误触 `exactMatchBoost`。Fork 正确处理 |
| 运行时可移植性 | 上游仅支持 Bun。Fork 支持 Bun + Node.js 22+ |
| 进程退出安全 | 上游定时器可能阻止进程退出。Fork 正确清理 |

### 维护风险/同步建议

- 🔵 **Bug 修复** — `return hydratedResults.slice(0, resultLimit)` 和空标签修复应**立即向上游 PR**，这是实际的功能缺陷
- 🟢 **有意保留** — 候选限制函数、SQLite 双层回退、定时器清理
- 🟡 **需评估同步** — 上游的 `fix(embedding): prevent pipeline() hang in Node/Bun runtime`（`f455c8e`）和 `fix(embedding): migrate from @xenova/transformers to @huggingface/transformers`（`40508eb`）已在 fork `ee765aa` 中吸收，但具体实现路径（模块级 vs 实例方法）不同，下次同步需逐行验证

---

## 5. Auto-Capture 与 User Profile

**涉及文件**: `src/services/auto-capture.ts`、`src/services/user-memory-learning.ts`、`src/services/language-detector.ts`、`src/services/user-prompt/user-prompt-manager.ts`、`src/services/logger.ts`

### 上游做法

- **Auto-Capture**：全局 `isCaptureRunning` 布尔锁（所有会话共享），返回 `void`，失败即最终结果。依赖 `getV2Client()` 获取 v2 客户端，提供者未连接时抛出硬错误。Schema 期望严格 `{summary, type, tags}` 格式。
- **User Profile Learning**：同样依赖 `getV2Client()`，硬错误行为一致
- **语言检测**：直接 `franc(text, { minLength: 5 })`，无预处理。代码块和文件路径会干扰检测结果（偏向英语）
- **Prompt 管理**：仅有 `claimPrompt()`，无释放机制。失败后 prompt 永久卡在 `captured=2` 状态
- **日志**：直接 `JSON.stringify(data)`，大负载或循环引用可能导致日志记录本身崩溃

### Fork 做法

1. **会话级锁**：全局布尔锁 → `runningSessions` Set（以 `sessionID` 为键），支持并发多会话捕获
2. **结果类型化**：返回 `AutoCaptureResult`（`"captured" | "skipped" | "retry" | "none" | "busy"`），支持多通道捕获（每个空闲事件最多 10 次循环）
3. **Prompt 释放**：新增 `releasePrompt(promptId)`，捕获失败时将 `captured` 从 2 重置为 0，允许后续重试
4. **去 v2 客户端依赖**：`generateSummary()` 不再调用 `getV2Client()`，改用 `{ providerName, modelId }` 参数，支持直接 HTTP 回退
5. **灵活 Schema**：`z.unknown()` 替代 `z.object(...)`，新增 `normalizeAutoCaptureResult()` 管道处理各种 LLM 输出格式
6. **温度控制**：通过 `CONFIG.memoryTemperature`（默认 0.3）显式控制记忆生成温度
7. **提供者软化**：硬错误 → 警告日志 + 继续尝试
8. **语言检测重写**：
   - 新增 `sanitizeTextForLanguageDetection()`：移除代码块、行内代码、URL、文件路径
   - 新增 `detectByScript()`：Unicode 脚本范围快速路径（CJK → 中文/日文/韩文，西里尔 → 俄文，阿拉伯 → 阿拉伯文）
   - 更大的 ISO 639-3 到 639-1 映射
9. **日志安全**：`truncateString()`（2048 字符）、`sanitizeLogData()`（递归限制：20 项/键，4 层深度）、`serializeLogData()`（try-catch 包装）

### 差异影响

| 方面 | 影响 |
|------|------|
| 多会话支持 | 上游全局锁不支持并发；Fork 独立跟踪每个会话 |
| 捕获可靠性 | 上游失败即丢失；Fork 支持重试 + 多通道捕获 |
| LLM 输出兼容 | 上游期望严格 Schema，LLM 返回不同格式时解析失败；Fork 柔性解析 |
| 语言检测准确性 | 代码密集型对话中，Fork 的检测显著更准确（尤其对中日韩语言） |
| 日志稳定性 | 上游在大负载下可能因序列化失败而丢失日志 |

### 维护风险/同步建议

- 🟢 **有意保留** — 所有改动均为健壮性增强
- 🟡 **需评估同步** — 语言检测重写（`sanitizeTextForLanguageDetection` + `detectByScript`）是通用改进，值得向上游 PR
- 🟡 **需评估同步** — `releasePrompt()` 机制解决了 prompt 永久卡住的痛点，上游也存在同样问题
- 🟡 **需评估同步** — 上游已合并相同的 `all-projects` 查询 scope（`59d5eeb`）和中文语言检测修复（`dbe32de`），Fork 已吸收，无冲突

---

## 6. OpenCode Provider 集成

**涉及文件**: `src/services/ai/opencode-provider.ts`、`src/services/ai/opencode-state.ts`（Fork 新增）

### 上游做法

- **架构**：单一路径，始终通过 v2 SDK session 的 `generateStructuredOutput` 调用
- **签名**：`(opts: StructuredOutputOptions<T>)`，必须传入 `client: OpencodeClient`
- **Provider 路由**：纯 `opencode provider.list()` API
- **JSON Schema**：每次调用动态 `(await import("zod")).z.toJSONSchema(schema)`
- **错误处理**：无 v2Client 或 provider 未连接时硬错误
- **State 管理**：`_connectedProviders` 使用 `Set<string>`（O(1) 查找），内联在 `opencode-provider.ts` 中
- **上游 v2.14 新增**：
  - `refactor(ai): use opencode v2 SDK session.prompt for structured output`（`8c5d5a0`）
  - `feat/github-copilot-sdk` 和 `feat/opencode-native-auth` 两个合并 PR

### Fork 做法

1. **双路径架构**：
   - `generateStructuredOutputViaV2` — v2 SDK 路径（有客户端时优先）
   - `generateStructuredOutputDirect` — 直接 HTTP 路径（回退）
   - `isV2Options()` 分派逻辑
2. **新增直接 HTTP 适配器**：
   - `callOpenAICompatible()` — POST 到 `{baseUrl}/chat/completions`，`response_format: json_object`，400 时去掉 `response_format` 重试
   - `callAnthropic()` — POST 到 `{baseUrl}/messages`，`max_tokens: 4096` 硬编码，提取 text blocks
3. **配置文件发现**：`findOpencodeConfigPath()`、`loadOpencodeConfig()`、`getProviderConfig()` — 从磁盘读取 opencode 配置，解析 JSONC 中的 `{env:...}`、`{file:...}` 引用
4. **JSON Schema 优化**：静态 `toJsonSchema()` 辅助函数，先尝试实例方法，再回退静态方法，避免每次调用的动态 import
5. **状态提取**：`opencode-state.ts` 独立模块管理 `_connectedProviders`（`string[]`）、`_statePath`、`_configPath`
6. **温度支持**：`DirectStructuredOutputOptions` 上的 `temperature` 字段

### 差异影响

| 方面 | 影响 |
|------|------|
| Provider 独立性 | 上游强依赖 v2 session API，不可用时直接失败。Fork 可在无 v2 客户端时通过直接 HTTP 工作 |
| 配置自发现 | Fork 能独立读取 opencode 配置文件，不依赖 SDK 路由。上游完全依赖 SDK 内部路由 |
| 优雅降级 | 上游硬失败；Fork 先试 v2，失败后降级到直接 HTTP |
| `Set→Array` 回归 | `_connectedProviders` 从 `Set<string>` 变为 `string[]`，O(1)→O(n) 查找。实际影响极小（provider 列表通常 <10 项） |

### 维护风险/同步建议

- 🟢 **有意保留** — 双路径架构是 Fork 的核心差异化特性，解决了"无 v2 客户端时整个记忆系统不可用"的问题
- 🔴 **潜在风险** — 上游 v2.14 重构了 AI 集成（`session.prompt`、GitHub Copilot SDK、OpenCode native auth），Fork 在 `67e35b6` 中吸收了部分更新，但双路径架构可能与上游的 `session.prompt` 路径产生冲突。下次同步需仔细验证 `opencode-provider.ts` 的合并
- 🔴 **潜在风险** — 上游 `feat/opencode-native-auth`（`1269947`）和 `feat/github-copilot-sdk`（`675813c`）引入了新的认证机制，Fork 的直接 HTTP 路径可能不兼容这些认证方式
- 🟡 **需评估** — `_connectedProviders` 的 `Set→Array` 变化可能是重构时的无意副作用，考虑改回 `Set` 以保持 O(1) 查找

---

## 7. Web UI 与 API

**涉及文件**: `src/services/web-server.ts`、`src/services/api-handlers.ts`、`src/web/app.js`、`src/web/index.html`、`src/web/i18n.js`、`src/web/styles.css`、`src/web/vendor/`（Fork 新增）

### 上游做法

- **HTTP 服务器**：`Bun.serve()` 原生服务器
- **搜索参数验证**：无 — 直接使用 `page`/`pageSize` 原始值，NaN 或负值可能导致异常
- **静态资源**：4 个 CDN 外部脚本（unpkg、jsdelivr）
- **文档查看**：无
- **i18n**：基础覆盖（~40 个键）
- **Header**：单个 GitHub 链接指向上游仓库
- **Vendor 目录**：不存在

### Fork 做法

1. **HTTP 服务器重写**：
   - `Bun.serve()` → `http.createServer()`（Node.js `http` 模块）
   - 新增 Node→Web 适配层：`handleNodeRequest()` → `buildRequest()` → `handleRequest()` → `writeNodeResponse()`
   - POST body 手动收集（`for await (const chunk of req)`）
   - 关闭改为 Promise 包装的 `server.close()`
2. **API 输入加固**：
   - `normalizePositiveInteger()` 辅助函数
   - `MAX_SEARCH_PAGE_SIZE = 100` 封顶
   - 搜索 API 的 `page`/`pageSize` 参数全面规范化
3. **静态资源自托管**：
   - 新增 `serveWebAsset()` — 从 `dist/web/` 提供 vendor 文件，含路径遍历保护
   - 4 个 vendor 文件：`jsonrepair.min.js`、`lucide.min.js`、`marked.umd.min.js`、`purify.min.js`
   - `Cache-Control: public, max-age=86400`
4. **文档服务**：
   - 新增 `serveDocsFile()` — 3 目录搜索（`dist/web/docs/` → `project-root/docs/` → `src/web/docs/`）
   - 含路径遍历保护，`Cache-Control: no-cache`
   - 新增 `/vendor/` 和 `/docs/*` 路由
5. **文档查看器 UI**：
   - 全新模态框系统：侧边栏导航、Markdown 渲染、hash 路由
   - `DOCS_TREE`（4 组 10 项）、`DOCS_LOOKUP` 映射
   - 双语内容加载（`/docs/{lang}/` 优先，回退 `/docs/`）
6. **i18n 大幅扩展**：~90+ 键（翻倍），含 tooltips、文档导航、迁移确认等
7. **Header 重设计**：双仓库链接（Upstream 蓝色 + Fork 绿色 pill 按钮）、"Learn This Project" 文档按钮
8. **定时器安全**：`healthCheckInterval.unref?.()` + jitter timer `unref?.()`

### 差异影响

| 方面 | 影响 |
|------|------|
| 运行时依赖 | 上游仅支持 Bun。Fork 支持 Node.js，但也增加了适配层复杂性 |
| 离线能力 | 上游依赖 CDN。Fork 完全自包含，可离线运行 |
| API 安全 | 上游无参数验证，可能受大 pageSize DoS。Fork 封顶 100 |
| 文档可用性 | 上游无文档查看器。Fork 提供 Web UI 内文档浏览 |

### 维护风险/同步建议

- 🟢 **有意保留** — 自托管 vendor、文档查看器、i18n 扩展、双仓库 branding
- 🔵 **Bug 修复** — `normalizePositiveInteger()` + `MAX_SEARCH_PAGE_SIZE` 应向上游 PR
- 🔴 **潜在风险** — `Bun.serve()` → `http.createServer()` 的迁移是最大的维护负担。如果上游未来增强 Web 服务器功能（如 WebSocket、streaming），适配层需要同步更新。建议长期考虑抽象出服务器接口层
- 🔴 **潜在风险** — 上游可能后续也在 `web-server.ts` 上做改动，合并时 Node 适配层可能产生大量冲突。这是 Fork 与上游差异最大的文件之一（224 行新增/3 行删除）

---

## 8. 跨平台与本地插件运行

**涉及文件**: `scripts/build.mjs`、`scripts/install-local-plugin-wrapper.mjs`、`scripts/backfill-historical-prompts.ts`、`tsconfig.json`、`.gitattributes`

### 上游做法

- **构建**：内联 Unix shell 命令 `mkdir -p dist/web && cp -r src/web/* dist/web/`
- **本地安装**：无本地插件安装工具，预期用户通过 npm 安装
- **行尾**：无 `.gitattributes` 规范化
- **TypeScript**：无显式 `types` 配置

### Fork 做法

1. **跨平台构建脚本**（`scripts/build.mjs`）：
   - `node:fs` 的 `cpSync` / `rmSync` 替代 `mkdir -p` / `cp -r`
   - 显式清理 + 文档目录复制到 `dist/web/docs/`
   - 缺失目录时抛出诊断性错误
2. **本地插件安装工具**（`scripts/install-local-plugin-wrapper.mjs`，~510 行）：
   - 生成 ESM 包装器到 `~/.config/opencode/plugins/opencode-mem.js`
   - `--check` 模式验证：构建产物存在、包装器最新、无 npm 包冲突、无 `require()` 调用、SQLite 在 Node 运行时下可用
   - Windows 路径处理（`replaceAll("\\", "/")`）
3. **历史回填脚本**（`scripts/backfill-historical-prompts.ts`，~310 行）：
   - 一次性维护工具，将历史 prompt 批量转化为结构化记忆
   - 仍依赖 `bun:sqlite`，需 Bun 运行时
4. **行尾规范化**（`.gitattributes`）：`* text=auto eol=lf`
5. **TypeScript 配置**：`"types": ["bun"]`

### 差异影响

| 方面 | 影响 |
|------|------|
| Windows 构建 | 上游在 Windows 上构建会失败。Fork 完全支持 |
| 本地开发 | Fork 有完整的本地插件注册/验证工作流 |
| 代码一致性 | `.gitattributes` 防止 CRLF/LF 伪差异 |

### 维护风险/同步建议

- 🟢 **有意保留** — 全部为 Fork 的跨平台/本地开发基础设施
- 🟡 **可考虑向上游 PR** — `build.mjs` 替代内联 shell 命令是纯粹的跨平台修复，对上游 Windows 用户也有价值
- 🔴 **潜在风险** — `backfill-historical-prompts.ts` 仍使用 `bun:sqlite` import，与 Fork 的"支持 Node.js"目标不一致。如果未来需要用 Node 运行，需迁移到 `sqlite-bootstrap.ts` 的双层回退模式

---

## 索引更新记录

| 上游已合并的 PR/提交 | Fork 吸收状态 |
|---|---|
| `fix(embedding): migrate to @huggingface/transformers` (`#90`) | ✅ 已吸收（`ee765aa`），实现路径不同（模块级 vs 实例方法） |
| `feat(memory): add optional all-projects query scope` (`#84`) | ✅ 已吸收（`d958a86`），无冲突 |
| `fix: Chinese language detection fallback` (`#76`) | ✅ 已吸收（`9c65342`），Fork 进一步重写了检测逻辑 |
| `fix: allow explicit profile preference writes` (`#91`) | ✅ 已吸收（`0528c42`），无冲突 |
| `fix(plugin): derive id from package name` (`#92`) | ✅ 已吸收（`c2c0eb6`），但 Fork 的 plugin.ts 已完全重写 |
| `refactor(ai): tighten openai-chat typing` (`#93`) | ✅ 已吸收（`028fcc5`），无冲突 |
| `fix(index): defer opencode provider startup import` (`6186a69`) | ✅ 已吸收（`efffacc`），实现方式不同（Fork 用 in-flight 去重） |
| `fix(embedding): defer transformers initialization` (`eee6ffc`) | ✅ 已吸收（`ee765aa`），实现方式不同 |
| `fix(embedding): prevent pipeline() hang` (`f455c8e`) | ✅ 已吸收（`ee765aa`），实现方式不同 |
| `fix(api): remove embedding warmup from read-only handlers` (`20748be`) | ✅ 已吸收（`67e35b6`），无冲突 |
| `fix(embedding): replace 'as any' with PretrainedModelOptions` (`9e50c26`) | ✅ 已吸收（`67e35b6`），无冲突 |
| `refactor(ai): use opencode v2 SDK session.prompt` (`8c5d5a0`) | ⚠️ 部分吸收（`67e35b6`），Fork 的双路径架构与此重构方向不同 |
| `feat/github-copilot-sdk` (`675813c`) | ⚠️ 部分吸收（`67e35b6`），需验证与直接 HTTP 路径的兼容性 |
| `feat/opencode-native-auth` (`1269947`) | ⚠️ 部分吸收（`67e35b6`），需验证与直接 HTTP 路径的兼容性 |

---

## 优先行动建议

### 应立即向上游 PR 的修复（Bug Fix）

1. **搜索结果截断**：`vector-search.ts` 中 `return hydratedResults` → `return hydratedResults.slice(0, resultLimit)`
2. **空标签解析**：`"".split(",")` 返回 `[""]` 的处理
3. **搜索参数验证**：`api-handlers.ts` 的 `normalizePositiveInteger()` + pageSize 封顶
4. **空闲定时器清理**：`index.ts` shutdown 时的 `clearTimeout` 循环

### 下次上游同步需重点验证的文件

| 文件 | 风险等级 | 原因 |
|------|----------|------|
| `src/services/ai/opencode-provider.ts` | 🔴 高 | 双路径架构 vs 上游 `session.prompt` 重构，合并冲突概率最高 |
| `src/services/web-server.ts` | 🔴 高 | Bun→Node 适配层，上游任何 web-server 改动都需要手工适配 |
| `src/services/embedding.ts` | 🟡 中 | 实例方法 vs 模块级加载，功能等价但结构不同 |
| `src/plugin.ts` | 🟡 中 | 上游 v2.14 可能修改了 plugin 导出约定 |

### 建议在 Fork 内部修复的问题

1. `context.ts` 中 `parts.length === 8` 的魔法数字 → 添加注释或改用语义化常量
2. `opencode-state.ts` 中 `_connectedProviders` 考虑改回 `Set<string>`
3. `backfill-historical-prompts.ts` 的 `bun:sqlite` 依赖 → 迁移到 `sqlite-bootstrap.ts` 的双层回退
4. SDK 版本 `^1.14.41` — 审计实际使用的 API，确认是否有必要锁定如此高的版本
