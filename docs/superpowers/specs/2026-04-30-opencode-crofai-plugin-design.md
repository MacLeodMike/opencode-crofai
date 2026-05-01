# OpenCode CrofAI Plugin — Design Spec

## Overview

An OpenCode plugin that registers [CrofAI](https://crof.ai) as a first-class provider. CrofAI is an OpenAI-compatible LLM API provider offering cheap access to open-weight models. The plugin dynamically fetches the available models from CrofAI's `/v1/models` endpoint so users always see the latest models without updating the plugin.

## Distribution

Published as an npm package: **`oc-crofai`**. Users install with:

```
opencode plugin add oc-crofai
```

## Package Structure

```
oc-crofai/
  package.json      — name, version, main entry, devDeps
  index.mjs         — exports CrofaiPlugin
  README.md         — installation and usage
  LICENSE           — MIT
  .gitignore        — node_modules, etc.
```

## Plugin Architecture

The plugin exports a single async function `CrofaiPlugin` that returns OpenCode hooks.

### Hook: `config`

Injects the CrofAI provider definition into OpenCode's runtime config so it appears in the provider list:

```js
config.provider = config.provider || {};
config.provider.crofai = {
  id: "crofai",
  name: "CrofAI",
  npm: "@ai-sdk/openai-compatible",
  api: "https://crof.ai/v1",
  env: ["CROFAI_API_KEY"],
};
```

### Hook: `provider`

Registers a provider hook with `id: "crofai"`. The `models` callback fetches `GET https://crof.ai/v1/models` and maps the response to OpenCode's `ModelV2` schema.

**API response shape:**

```json
{
  "data": [
    {
      "id": "kimi-k2.6",
      "name": "MoonshotAI: Kimi K2.6",
      "context_length": 262144,
      "max_completion_tokens": 262144,
      "reasoning_effort": true,
      "custom_reasoning": false,
      "created": 1776737314,
      "pricing": {
        "prompt": "0.00000050",
        "completion": "0.00000199",
        "cache_prompt": "0.00000010"
      }
    }
  ]
}
```

**Field mapping (CrofAI API → OpenCode `ModelV2` schema):**

| CrofAI field | Model field | Transformation |
|---|---|---|
| `id` | `id` | As-is |
| (provider id) | `providerID` | `"crofai"` |
| `name` | `name` | As-is |
| (provider config) | `api.id` | Same as model `id` |
| (provider config) | `api.url` | `"https://crof.ai/v1"` |
| (provider config) | `api.npm` | `"@ai-sdk/openai-compatible"` |
| `context_length` | `limit.context` | As-is |
| `max_completion_tokens` | `limit.output` | As-is |
| `reasoning_effort` or `custom_reasoning` | `capabilities.reasoning` | `true` if either is truthy |
| `reasoning_effort` | `options.reasoning_effort` | Set to `"medium"` as default; see variant support below |
| (see below) | `capabilities.interleaved` | `{ field: "reasoning_content" }` if model is reasoning-capable |
| `pricing.prompt` | `cost.input` | Parse as float, multiply by 1,000,000 to convert per-token → per-Mtok |
| `pricing.completion` | `cost.output` | Same conversion |
| `pricing.cache_prompt` | `cost.cache.read` | Same conversion (0 if absent) |
| (default) | `capabilities.toolcall` | `true` |
| (default) | `capabilities.temperature` | `true` |
| (default) | `capabilities.attachment` | `false` |
| (default) | `capabilities.input` | `{ text: true }` |
| (default) | `capabilities.output` | `{ text: true }` |
| (default) | `cost.cache.write` | `0` |
| (default) | `status` | `"active"` |
| `created` (Unix ts) | `release_date` | Convert to ISO date string via `new Date(ts * 1000).toISOString().split('T')[0]` |
| (default) | `options` | `undefined` (set to `{ reasoning_effort }` for effort models) |
| (default) | `headers` | `undefined` |

### Reasoning / Thinking Support

All reasoning-capable models (detected via `reasoning_effort: true` or `custom_reasoning: true`) support CrofAI's `reasoning_effort` parameter with four levels:

| Variant | `reasoning_effort` | Effect |
|---|---|---|
| `none` | `"none"` | Disables thinking/reasoning — reduces latency and cost |
| `low` | `"low"` | Minimal thinking budget |
| `medium` | `"medium"` | Balanced (default) |
| `high` | `"high"` | Maximum thinking budget for complex problems |

Reasoning models also set:
- `capabilities.interleaved: { field: "reasoning_content" }` for proper thinking token streaming via `delta.reasoning_content`

### Hook: `auth`

Registers an auth hook for provider `"crofai"`.

**Loader:** Returns the stored API key. Falls back to `CROFAI_API_KEY` env var if no key was stored interactively.

```js
loader: async (getAuth, provider) => {
  const auth = await getAuth();
  if (auth?.type === "api" && auth.key) {
    return { apiKey: auth.key };
  }
  // Fallback to env var
  if (process.env.CROFAI_API_KEY) {
    return { apiKey: process.env.CROFAI_API_KEY };
  }
  return {};
}
```

**Methods:** Single API key entry method:

```js
{
  provider: "crofai",
  label: "Enter your CrofAI API Key",
  type: "api",
}
```

OpenCode prompts the user for the key once, stores it, and the loader returns it on every request.

## Error Handling

- **Network failure on model fetch:** The models callback catches errors and returns `{}` (no models). OpenCode falls back to any statically configured models. The plugin should log a warning but not crash.
- **Invalid API key:** OpenCode's standard 401 handling applies — the user is notified of the auth error.
- **Malformed API response:** If the response JSON doesn't match expected shape, log a warning and return `{}`.

## Testing

- Unit test the model mapping function with mock API response data
- Integration test: verify the plugin exports the correct shape via the type system (`@opencode-ai/plugin` types)
- Manual test: `opencode plugin add` pointing to a local path, verify provider appears in the list

## Future Possibilities

- Support CrofAI's TOS/enterprise features if they add OAuth
- Model-specific attachment support when CrofAI's API provides vision capability data per model
- Per-model `temperature` support based on model family (some models may not support it)
- Cache write pricing: CrofAI's API doesn't currently expose this; map if added
