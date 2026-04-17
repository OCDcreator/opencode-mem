# Provider 怎么配置

Provider 决定的是：插件用哪个大模型来做自动采集摘要、用户画像分析和结构化输出。

如果这里没配好，最常见的结果就是：

- 自动采集一直没有新增记忆
- 用户画像页面一直空着
- 日志里出现 Provider 相关错误

## 最推荐的配置方式

优先复用你已经在 OpenCode 里能正常使用的 Provider。

也就是说，优先使用下面这两个配置项：

- `opencodeProvider`
- `opencodeModel`

这样最省事，因为你不用为了这个插件再维护一套新的模型配置。

## 这里和“本地嵌入模型”不是一回事

很多人会把这两件事混在一起：

- `embeddingModel`：负责搜索向量
- `opencodeProvider` / `memoryModel`：负责自动采集和用户画像分析

所以就算你继续使用本地嵌入模型，这一页依然和自动采集配置有关。

## 配置文件放哪里

通常配置文件在这里：

`~/.config/opencode/opencode-mem.jsonc`

如果你想给某个项目单独覆盖配置，也可以放在项目里的：

`.opencode/opencode-mem.jsonc`

项目内配置会覆盖全局配置。

## 手把手配置方法

### 方案一：推荐，直接复用 OpenCode 的 Provider

先打开：

`~/.config/opencode/opencode-mem.jsonc`

填入类似下面的内容：

```jsonc
{
  "opencodeProvider": "zhipu-coding-plan",
  "opencodeModel": "glm-4.7",
}
```

如果你用的是 OpenAI，也可以写成：

```jsonc
{
  "opencodeProvider": "openai",
  "opencodeModel": "gpt-4o-mini",
}
```

如果你用的是 Anthropic，也可以写成：

```jsonc
{
  "opencodeProvider": "anthropic",
  "opencodeModel": "claude-haiku-4-5-20251001",
}
```

写完后重启当前 OpenCode 项目实例，再观察自动采集和用户画像是否开始工作。

如果你只想对某个项目单独修改，也可以把同样内容写进：

`.opencode/opencode-mem.jsonc`

这样只会覆盖当前项目，不会影响其他项目。

### 方案二：不用 OpenCode Provider，自己单独填写 API

如果你不想走 `opencodeProvider`，也可以手动配置：

```jsonc
{
  "memoryProvider": "openai-chat",
  "memoryModel": "gpt-4o-mini",
  "memoryApiUrl": "https://api.openai.com/v1",
  "memoryApiKey": "env://OPENAI_API_KEY",
}
```

这套方式适合：

- 你不想复用 OpenCode 的模型
- 你希望插件单独走一套接口
- 你已经有现成的兼容 OpenAI 的服务
- 你本地已经跑了一个兼容 OpenAI 的模型服务

例如：

```jsonc
{
  "memoryProvider": "openai-chat",
  "memoryModel": "your-local-model-name",
  "memoryApiUrl": "http://127.0.0.1:11434/v1",
  "memoryApiKey": "ollama",
}
```

不过要注意：

- 有些本地服务能聊天
- 但不一定完全适合插件当前的自动采集流程

## `memoryApiKey` 推荐怎么写

推荐用环境变量，不要把真实密钥直接写进文档或仓库：

```jsonc
"memoryApiKey": "env://OPENAI_API_KEY"
```

也支持从文件读取：

```jsonc
"memoryApiKey": "file://~/.config/opencode/api-key.txt"
```

## 配好后怎么验证

你可以按这个顺序检查：

1. WebUI 能正常打开
2. 自动采集是否开始生成新记忆
3. 用户画像页是否能看到内容
4. 日志里是否还有 Provider 报错

## 一条最实用的建议

如果你已经知道 OpenCode 当前使用的是哪一个 Provider 和模型，直接把那一套填到 `opencodeProvider` 和 `opencodeModel`，通常就是最稳的做法。
