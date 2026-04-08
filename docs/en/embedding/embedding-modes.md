# How to Choose an Embedding Mode

First, the direct answer: local embedding model support is still here. It was not removed.

But two different things are often both called “local model”:

- `embeddingModel`: controls search vectors
- `opencodeProvider` / `memoryModel`: control auto capture and profile analysis

So it helps to separate them clearly.

## Local support that still exists

### Local embedding models

This is still supported.

You can still configure:

```jsonc
{
  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

Examples include:

- `Xenova/nomic-embed-text-v1`
- `Xenova/jina-embeddings-v2-base-en`
- `Xenova/jina-embeddings-v2-small-en`
- `Xenova/all-MiniLM-L6-v2`
- `Xenova/all-mpnet-base-v2`

### Local LLM endpoints

This is not configured through `embeddingModel`.

If you run a local OpenAI-compatible service, it belongs to the auto-capture side and is configured through:

- `memoryProvider`
- `memoryModel`
- `memoryApiUrl`
- `memoryApiKey`

## The two main embedding choices

### Remote mode

Best when:

- You want the easiest setup
- You do not want to download local models
- You already have an embedding API

### Local mode

Best when:

- You want embeddings to run locally
- You are fine with a first-time download
- You are comfortable with local model setup

## Example: local embedding setup

```jsonc
{
  "embeddingModel": "Xenova/nomic-embed-text-v1",
}
```

In this mode:

- the model is loaded only when needed
- the first run may download model files
- cached files are kept in the plugin data area

## Example: remote embedding setup

```jsonc
{
  "embeddingModel": "text-embedding-v4",
  "embeddingDimensions": 1024,
  "embeddingApiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "embeddingApiKey": "env://DASHSCOPE_API_KEY",
}
```

## One important detail

If you use `text-embedding-v4`, set the dimensions to `1024`.

If the dimension is wrong, search and indexing can break.
