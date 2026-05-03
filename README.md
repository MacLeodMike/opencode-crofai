# oc-crofai

An [OpenCode](https://opencode.ai) plugin that adds [CrofAI](https://crof.ai) as a first-class provider.

CrofAI provides cheap access to open-weight LLMs. This plugin dynamically discovers available models from CrofAI's API, so you always see the latest models without updating the plugin.

## Installation

```bash
opencode plugin -g oc-crofai
```

## Removal

```bash
opencode plugin -r oc-crofai
```

This removes the plugin from OpenCode's global plugins. You can also delete the cache file at `~/.cache/opencode/crofai-models.json`.

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
- **`provider`** — Fetches `https://crof.ai/v1/models` on startup and maps the response (context length, pricing, reasoning capabilities) to OpenCode's model schema. Models are sorted alphabetically and cached to disk for instant startup, with background refresh to keep them current.
- **`auth`** — Provides interactive API key entry with automatic `CROFAI_API_KEY` env var fallback

## Features

- **Disk cache with background refresh** — Models load instantly from cache on startup; fresh data is fetched in the background so subsequent calls always see the latest models
- **1-hour cache TTL** — Stale caches are discarded and re-fetched automatically
- **Cache schema version** — Old cached data from previous plugin versions is automatically discarded
- **10s fetch timeout** — Prevents hangs if the API is unreachable
- **Model sorting** — Models are sorted alphabetically for consistent ordering in the UI
- **Vision detection** — Vision-capable models are automatically detected by scraping CrofAI's pricing page; no hardcoded list to maintain
- **Variants on first run** — Reasoning variants are available immediately, even on very first startup

## Vision Support

Vision-capable models are automatically detected from CrofAI's pricing page, so models with image input are marked accordingly in the model list.

## Thinking / Reasoning Support

All reasoning-capable models include four variants for controlling thinking depth:

| Variant | Reasoning Effort | Effect |
|---------|-----------------|--------|
| `none` | `"none"` | Disables reasoning — reduces latency and cost |
| `low` | `"low"` | Minimal thinking, faster responses |
| `medium` | `"medium"` | Balanced (default) |
| `high` | `"high"` | Maximum thinking, best reasoning |

To use a variant, set it in your OpenCode agent config:

```yaml
agent:
  build:
    model: crofai/kimi-k2.6
    variant: high
```

## License

MIT
