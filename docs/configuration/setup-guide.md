# 配置向导：第一次怎么配

如果你想尽快把这个插件用起来，照着这一页配就够了。

## 第一步：找到配置文件

全局配置文件通常在：

`~/.config/opencode/opencode-mem.jsonc`

如果没有这个文件，插件通常会自动生成一个模板。

如果你只想给某个项目单独覆盖配置，也可以在项目里创建：

`.opencode/opencode-mem.jsonc`

这个项目内文件会覆盖全局配置。

## 第二步：先填最推荐的一版

先用这份最小可用配置：

```jsonc
{
  "webServerEnabled": true,
  "webServerPort": 4747,

  "autoCaptureEnabled": true,

  "opencodeProvider": "zhipuai-coding-plan",
  "opencodeModel": "glm-4.5",

  "embeddingModel": "text-embedding-v4",
  "embeddingDimensions": 1024,
  "embeddingApiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "embeddingApiKey": "env://DASHSCOPE_API_KEY",
}
```

如果你不是用这套 Provider，也可以把 `opencodeProvider` 和 `opencodeModel` 换成你自己的。

## 如果你想继续使用本地嵌入模型

这也是支持的，没有被删。

你可以把嵌入部分改成：

```jsonc
{
  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

例如：

```jsonc
{
  "webServerEnabled": true,
  "webServerPort": 4747,

  "autoCaptureEnabled": true,

  "opencodeProvider": "zhipuai-coding-plan",
  "opencodeModel": "glm-4.5",

  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

这表示：

- 自动采集和用户画像继续走你配置的大模型
- 搜索向量改为本地嵌入模型生成

## 如果你想让自动采集也走本地接口

这不是通过 `embeddingModel` 配的，而是通过手动 API 配置来做。

例如你本地已经有一个兼容 OpenAI 的服务：

```jsonc
{
  "memoryProvider": "openai-chat",
  "memoryModel": "your-local-model-name",
  "memoryApiUrl": "http://127.0.0.1:11434/v1",
  "memoryApiKey": "ollama",
}
```

这种方式是否完全可用，要看你本地服务对插件当前调用方式的兼容程度。

## 第三步：理解这几个最重要的配置项

### `opencodeProvider` 和 `opencodeModel`

决定插件用哪个大模型做自动采集和用户画像。

### `embeddingModel`、`embeddingApiUrl`、`embeddingApiKey`

决定插件用什么方式做搜索向量。

### `webServerPort`

决定 WebUI 开在哪个端口，默认通常是 `4747`。

### `storagePath`

决定数据库、向量索引、用户画像库等数据存到哪里。

默认是全局路径：

`~/.opencode-mem/data`

如果你想让某个项目单独存一份数据，可以在项目级配置里改成项目内路径，例如：

```jsonc
{
  "storagePath": ".opencode/opencode-mem-data",
}
```

## 第四步：重启当前项目实例

配置改完后，需要重启当前 OpenCode 项目实例，新的设置才会生效。

## 第五步：验证有没有成功

你可以按这个顺序看：

1. `http://127.0.0.1:4747` 能不能打开
2. 项目记忆页能不能正常显示
3. 自动采集过一会儿后有没有新记忆出现
4. 用户画像页后续会不会逐渐出现内容

## 全局安装和项目级配置，到底有什么区别

### 全局配置

如果你只修改：

`~/.config/opencode/opencode-mem.jsonc`

那默认效果通常是：

- 配置是全局的
- 数据存储默认也是全局的
- 日志默认也是全局的

### 项目级配置

如果你在项目里增加：

`.opencode/opencode-mem.jsonc`

那么这个项目就可以覆盖全局配置。

最常见的做法是只覆盖这些内容：

- `opencodeProvider`
- `opencodeModel`
- `embeddingModel`
- `storagePath`

### 一个很重要的区别

项目级配置不代表日志天然就会变成项目级。

当前仓库里：

- **数据存储位置** 可以通过 `storagePath` 改成项目内
- **日志文件位置** 默认仍然是全局的 `~/.opencode-mem/opencode-mem.log`

如果你想把日志也改成项目级，需要额外设置环境变量：

`OPENCODE_MEM_LOG_FILE`

## 常见的两种配置思路

### 思路一：推荐，复用 OpenCode 已有模型

优点：

- 最省事
- 不容易重复配置
- 一般最稳

### 思路二：插件自己走独立 API

适合：

- 你要和 OpenCode 主模型分开
- 你已经有单独的兼容 OpenAI 接口
- 你想接本地启动的大模型服务

这种情况就去看“Provider 配置”那一页。

## 最后一个提醒

如果你用的是 `text-embedding-v4`，一定要把：

`"embeddingDimensions": 1024`

一起写上。

这个项漏掉时，后面很容易出现搜索或索引问题。
