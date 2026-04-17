# 嵌入模式怎么选

先说结论：这个项目的本地嵌入模型支持还在，没有删。

不过这里很容易把两件事混在一起：

- `embeddingModel`：负责记忆搜索的向量
- `opencodeProvider` / `memoryModel`：负责自动采集和用户画像

所以“本地模型还在不在”要分开看。

## 目前还保留的本地能力

### 本地嵌入模型

这个功能还在。

你现在依然可以这样配置：

```jsonc
{
  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

常见示例还有：

- `Xenova/nomic-embed-text-v1`
- `Xenova/jina-embeddings-v2-base-en`
- `Xenova/jina-embeddings-v2-small-en`
- `Xenova/all-MiniLM-L6-v2`
- `Xenova/all-mpnet-base-v2`

### 本地大模型接口

这不是通过 `embeddingModel` 配的。

如果你本机已经跑了一个兼容 OpenAI 的服务，那它属于自动采集这一侧，要通过：

- `memoryProvider`
- `memoryModel`
- `memoryApiUrl`
- `memoryApiKey`

来配置。

## 你只需要知道两个嵌入选择

### 远端嵌入

适合：

- 你希望配置简单、稳定优先
- 你不想下载本地模型
- 你已经有可用的嵌入 API

### 本地嵌入

适合：

- 你希望搜索向量完全在本地生成
- 你能接受第一次下载模型
- 你愿意处理本机环境和缓存问题

## 本地嵌入怎么配

最简单的例子：

```jsonc
{
  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

这种模式下：

- 插件会在真正需要时再加载本地模型
- 第一次可能需要联网下载模型文件
- 缓存会放在插件数据目录下

## 远端嵌入怎么配

例如：

```jsonc
{
  "embeddingModel": "text-embedding-v4",
  "embeddingDimensions": 1024,
  "embeddingApiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "embeddingApiKey": "env://ALIBABA_API_KEY",
}
```

## 一个重要提醒

如果你使用的是 `text-embedding-v4`，记得把维度设置成 `1024`。

这不是可选建议，而是必须项。维度不对，搜索和索引就可能出问题。
