# How to Configure the Provider

The provider decides which model the plugin uses for auto capture, profile learning, and structured output.

If this part is not configured correctly, the most common results are:

- Auto capture never creates new memories
- The User Profile page stays empty
- Logs show provider-related errors

## The recommended approach

Reuse the same provider and model that already work in OpenCode.

That usually means setting:

- `opencodeProvider`
- `opencodeModel`

This is the easiest and safest option because you do not need a second model setup just for the plugin.

## This is different from local embeddings

People often mix these together:

- `embeddingModel`: controls search vectors
- `opencodeProvider` / `memoryModel`: control auto capture and profile analysis

So even if you keep local embeddings enabled, this page still matters for the model used by the plugin itself.

## Where to put the config

The usual global config file is:

`~/.config/opencode/opencode-mem.jsonc`

You can also override settings per project in:

`.opencode/opencode-mem.jsonc`

Project-level config overrides the global config.

## Step-by-step setup

### Option 1: Recommended, reuse the OpenCode provider

Open:

`~/.config/opencode/opencode-mem.jsonc`

Add something like:

```jsonc
{
  "opencodeProvider": "zhipu-coding-plan",
  "opencodeModel": "glm-4.7",
}
```

If you use OpenAI, it can look like:

```jsonc
{
  "opencodeProvider": "openai",
  "opencodeModel": "gpt-4o-mini",
}
```

If you use Anthropic, it can look like:

```jsonc
{
  "opencodeProvider": "anthropic",
  "opencodeModel": "claude-haiku-4-5-20251001",
}
```

After that, restart the current OpenCode project instance and check whether auto capture and user profile start working.

If you only want to change this for one project, put the same settings in:

`.opencode/opencode-mem.jsonc`

That will override the global config only for the current project.

### Option 2: Use a separate API config

If you do not want to use `opencodeProvider`, you can configure a separate API:

```jsonc
{
  "memoryProvider": "openai-chat",
  "memoryModel": "gpt-4o-mini",
  "memoryApiUrl": "https://api.openai.com/v1",
  "memoryApiKey": "env://OPENAI_API_KEY",
}
```

This is useful when:

- You want the plugin to use a different model than OpenCode
- You already have a separate OpenAI-compatible endpoint
- You already have a local model service running on your machine

For example:

```jsonc
{
  "memoryProvider": "openai-chat",
  "memoryModel": "your-local-model-name",
  "memoryApiUrl": "http://127.0.0.1:11434/v1",
  "memoryApiKey": "ollama",
}
```

## Recommended `memoryApiKey` format

Use an environment variable when possible:

```jsonc
"memoryApiKey": "env://OPENAI_API_KEY"
```

You can also load it from a file:

```jsonc
"memoryApiKey": "file://~/.config/opencode/api-key.txt"
```

## How to verify the setup

Check in this order:

1. Does the WebUI open normally?
2. Does auto capture start creating memories?
3. Does the User Profile page begin to show content?
4. Do the logs still show provider errors?
