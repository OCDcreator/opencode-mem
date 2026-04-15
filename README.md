# OpenCode Memory

[![npm version](https://img.shields.io/npm/v/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![npm downloads](https://img.shields.io/npm/dm/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![license](https://img.shields.io/npm/l/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)

![OpenCode Memory Banner](.github/banner.png)

一个面向 AI 编码代理的持久记忆系统，基于本地向量数据库，让跨会话的长期上下文保留成为可能。

## Fork 状态

这个仓库是当前持续维护的 fork：

- **Fork**：`OCDcreator/opencode-mem`
- **上游仓库**：`tickernelz/opencode-mem`
- **本 fork 当前包版本**：`2.13.0-custom`

这个 fork 保留了上游记忆插件的核心能力，但它**不是**纯镜像版本。当前维护重点是：

- 本地插件启动更稳定
- Windows 优先开发，同时保持 **macOS 对等支持**
- 本地 embedding 与远程 embedding 的切换更稳妥
- 更适合本地 wrapper 调试迭代与 Web UI 使用体验优化

## 这个 Fork 做了哪些改动

和上游相比，这个 fork 目前保留了几类更偏实用性的差异化改动：

- **Embedding 启动更安全**：本地 embedding 仍然按需懒加载，远程 embedding 不会在只读场景里强制启动本地模型。
- **Embedding 运行时安装更稳**：本地 embedding 现在使用 `@huggingface/transformers`，在忽略 `postinstall` 脚本的插件安装环境里更稳健。
- **构建链路保持跨平台**：Web / docs 打包使用 Node 复制步骤，而不是 shell 命令，因此 `bun run build` 对 Windows 和 macOS 都更友好。
- **OpenCode 集成更稳固**：插件加载导出路径、provider 启动路径都针对这个 fork 的本地 OpenCode wrapper 工作流做了加固。
- **Web UI 更面向终端用户**：增加了双语界面优化、内置文档、更清晰的记忆统计文案和解释型 tooltip。
- **页头 branding 更清晰**：Web UI 会同时展示 upstream 和当前 fork 的仓库链接。

## 兼容性说明

- **远程 embedding 模式** 依然是最稳的启动路径：即使本地模型下载不可用，也能尽量保证 Web UI 和 `stats` 这类只读接口可用。
- **本地 embedding 模式** 仍然支持 `Xenova/nomic-embed-text-v1`、`Xenova/all-MiniLM-L6-v2` 这类 Hugging Face 模型 ID；变化的只是运行时包，不是模型命名方式。
- 这个 fork 的目标是尽量保持 Windows 与 macOS 行为一致，避免重新引入仅适配某个平台的 shell 构建命令或路径 hack。

## 可视化概览

**项目记忆时间线：**

![Project Memory Timeline](.github/screenshot-project-memory.png)

**用户画像查看器：**

![User Profile Viewer](.github/screenshot-user-profile.png)

## 核心特性

基于 SQLite 的本地向量数据库，优先使用 USearch 建索引并在失败时回退到 ExactScan；支持持久化项目记忆、自动用户画像学习、统一的记忆-提示词时间线、功能完整的 Web UI、基于提示词的智能记忆提取、多 AI provider 支持（OpenAI、Anthropic）、12+ 本地 embedding 模型、智能去重，以及内置隐私保护。

## 前置条件

这个插件优先使用 `USearch` 做内存向量索引，并在不可用时自动回退到 ExactScan。不需要自定义 SQLite 构建，也不需要额外的浏览器运行时 shim。

**推荐运行环境：**

- Bun
- 标准 OpenCode 插件环境

**说明：**

- 如果 `USearch` 不可用或运行失败，插件会自动回退到精确向量扫描。
- SQLite 依然是唯一事实来源；搜索索引在需要时会根据 SQLite 中的数据重建。

## 快速开始

把下面内容加入你的 OpenCode 配置文件 `~/.config/opencode/opencode.json`：

```jsonc
{
  "plugin": ["opencode-mem"],
}
```

下次启动时插件会自动下载并加载。

## 使用示例

```typescript
memory({ mode: "add", content: "Project uses microservices architecture" });
memory({ mode: "search", query: "architecture decisions" });
memory({ mode: "search", query: "architecture decisions", scope: "all-projects" });
memory({ mode: "profile" });
memory({ mode: "list", limit: 10 });
```

访问 `http://127.0.0.1:4747` 打开 Web 界面，用可视化方式浏览和管理记忆。

## 核心配置

在 `~/.config/opencode/opencode-mem.jsonc` 中配置：

```jsonc
{
  "storagePath": "~/.opencode-mem/data",
  "userEmailOverride": "user@example.com",
  "userNameOverride": "John Doe",
  "embeddingModel": "Xenova/nomic-embed-text-v1",
  "memory": {
    "defaultScope": "project",
  },
  "webServerEnabled": true,
  "webServerPort": 4747,

  "autoCaptureEnabled": true,
  "autoCaptureLanguage": "auto",

  "opencodeProvider": "anthropic",
  "opencodeModel": "claude-haiku-4-5-20251001",

  "showAutoCaptureToasts": true,
  "showUserProfileToasts": true,
  "showErrorToasts": true,

  "userProfileAnalysisInterval": 10,
  "maxMemories": 10,

  "compaction": {
    "enabled": true,
    "memoryLimit": 10,
  },
  "chatMessage": {
    "enabled": true,
    "maxMemories": 3,
    "excludeCurrentSession": true,
    "maxAgeDays": undefined,
    "injectOn": "first",
  },
}
```

### 记忆作用域

- `scope: "project"`：只查询当前项目，这是默认值。
- `scope: "all-projects"`：让 `search` / `list` 跨所有项目分片查询。
- `memory.defaultScope`：当没有显式传入 `scope` 时，决定默认查询范围。

### 自动采集使用的 AI Provider

**推荐方式：** 直接使用 OpenCode 已配置好的 provider，不需要再单独配置 API Key：

```jsonc
"opencodeProvider": "anthropic",
"opencodeModel": "claude-haiku-4-5-20251001",
```

这会直接复用你现有的 OpenCode 认证（OAuth 或 API Key）。如果你在 OpenCode 中使用 Claude Pro / Max 的 OAuth 登录，也不需要额外再填单独的 API Key。

支持的 provider：`anthropic`、`openai`

**回退方案：** 如果你不使用 `opencodeProvider`，也可以手动配置 API：

```jsonc
"memoryProvider": "openai-chat",
"memoryModel": "gpt-4o-mini",
"memoryApiUrl": "https://api.openai.com/v1",
"memoryApiKey": "sk-...",
```

**API Key 支持格式：**

```jsonc
"memoryApiKey": "sk-..."
"memoryApiKey": "file://~/.config/opencode/api-key.txt"
"memoryApiKey": "env://OPENAI_API_KEY"
```

更完整的说明请继续阅读本 README。

### 当前两个模型分别负责什么

这个插件里通常会同时出现两类模型，它们职责不同：

- `opencodeModel`（例如 `glm-4.7`）
  - 负责“理解和总结”
  - 用于自动采集时分析对话内容
  - 判断当前对话是否值得保存为记忆，还是应当跳过
  - 生成记忆摘要 `summary`
  - 生成记忆类型 `type`
  - 生成技术标签 `tags`
  - 也会用于用户画像学习这类需要语言理解和结构化输出的任务

- `embeddingModel`（例如 `text-embedding-v4`）
  - 负责“向量化和检索”
  - 把记忆正文转换成向量
  - 把标签转换成向量
  - 把搜索词转换成向量
  - 用于后续相似度搜索、召回和排序
  - 不负责写摘要，也不负责判断是否保存

可以简单理解为：

- `opencodeModel`：把对话**变成记忆**
- `embeddingModel`：把记忆**变成可搜索的向量**

## Fork 与上游链接

- **Fork 仓库**：https://github.com/OCDcreator/opencode-mem
- **上游仓库**：https://github.com/tickernelz/opencode-mem
- **上游 Issues**：https://github.com/tickernelz/opencode-mem/issues

## 开发与贡献

本地构建与测试：

```bash
bun install
bun run build
bun run typecheck
bun run format
```

如果你的改动是针对这个 fork 的，请优先保持以下约束不变：

- 跨平台可用的 `bun run build`
- local-wrapper / OpenCode loader 兼容性
- 本地 embedding 懒加载启动
- 远程 embedding 不在只读接口上强制触发本地模型初始化

无论是给 upstream 还是给这个 fork 提交贡献都欢迎，但如果某个改动依赖 fork 专有行为，请在提交说明里明确写清楚。

## 许可证与相关链接

MIT License，详见 `LICENSE` 文件。

- **上游仓库**：https://github.com/tickernelz/opencode-mem
- **Fork 仓库**：https://github.com/OCDcreator/opencode-mem
- **Issues**：https://github.com/tickernelz/opencode-mem/issues
- **OpenCode 平台**：https://opencode.ai

灵感来自 [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)
