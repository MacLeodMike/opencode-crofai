# oc-crofai

An [OpenCode](https://opencode.ai) plugin that adds [CrofAI](https://crof.ai) as a first-class provider.

CrofAI provides cheap access to open-weight LLMs. This plugin dynamically discovers available models from CrofAI's API, so you always see the latest models without updating the plugin.

## Installation

```bash
opencode plugin add oc-crofai
```

## Usage

1. **Get an API key** from [crof.ai](https://crof.ai)
2. OpenCode will prompt you to enter your CrofAI API key when you first use the provider
3. Select "CrofAI" as your provider and choose a model

Alternatively, set the `CROFAI_API_KEY` environment variable:

```bash
export CROFAI_API_KEY="your-api-key-here"
```

## How It Works

The plugin uses three OpenCode hooks:

- **`config`** — Registers CrofAI as a provider with `@ai-sdk/openai-compatible` SDK integration
- **`provider`** — Fetches `https://crof.ai/v1/models` on startup and maps the response (context length, pricing, reasoning capabilities) to OpenCode's model schema
- **`auth`** — Provides interactive API key entry with automatic `CROFAI_API_KEY` env var fallback

Models are fetched once when the provider loads. If CrofAI adds new models, simply restart OpenCode.

## Thinking / Reasoning Support

All reasoning-capable models include four variants for controlling thinking depth:

| Variant | Reasoning Effort | Effect |
|---------|-----------------|--------|
| `none` | `"none"` | Disables reasoning — reduces latency and cost |
| `low` | `"low"` | Minimal thinking, faster responses |
| `medium` | `"medium"` | Balanced (default) |
| `high` | `"high"` | Maximum thinking, best reasoning |

Set the variant in your OpenCode agent config:

```yaml
agent:
  build:
    model: crofai/kimi-k2.6
    variant: high
```

## License

MIT
