# OpenCode CrofAI Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an OpenCode plugin (`oc-crofai`) that registers CrofAI as a first-class provider with dynamic model discovery and interactive API key auth.

**Architecture:** Single-file plugin (`index.mjs`) using three OpenCode hooks: `config` (inject provider definition), `provider` (fetch models from `/v1/models` on load), and `auth` (interactive API key entry with env var fallback). Published as an npm package.

**Tech Stack:** JavaScript (ESM), `@opencode-ai/plugin` types, `@ai-sdk/openai-compatible` (provider SDK, no direct dependency needed).

---

### Task 1: Scaffold package files

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "opencode-crofai",
  "version": "0.1.0",
  "description": "OpenCode plugin for CrofAI — dynamically discovers available models",
  "main": "./index.mjs",
  "license": "MIT",
  "keywords": ["opencode", "plugin", "crofai", "llm", "provider"],
  "devDependencies": {
    "@opencode-ai/plugin": "^0.4.45"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
```

- [ ] **Step 3: Create LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Nahcrof LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Commit scaffold**

```
git add package.json .gitignore LICENSE
git commit -m "chore: scaffold opencode-crofai package"
```

---

### Task 2: Implement plugin (index.mjs)

**Files:**
- Create: `index.mjs`

This is the core of the plugin. It exports a single async function `CrofaiPlugin` returning three hooks:

1. **`config`** — injects the crofai provider definition into OpenCode config
2. **`provider`** — fetches models from `https://crof.ai/v1/models` and maps them to OpenCode's ModelV2 schema
3. **`auth`** — interactive API key entry with env var fallback

- [ ] **Step 1: Write the complete index.mjs**

```js
/**
 * OpenCode CrofAI Plugin
 *
 * Registers CrofAI as a first-class provider with:
 * - Dynamic model discovery from /v1/models
 * - Interactive API key auth with env var fallback
 */

const API_BASE = "https://crof.ai/v1";
const PROVIDER_ID = "crofai";

/**
 * Map a CrofAI API model object to OpenCode's ModelV2 schema.
 * CrofAI returns per-token pricing; OpenCode stores per-Mtok.
 */
function mapApiModel(apiModel) {
  const isReasoning = !!(apiModel.reasoning_effort || apiModel.custom_reasoning);

  return {
    id: apiModel.id,
    providerID: PROVIDER_ID,
    name: apiModel.name || apiModel.id,
    api: {
      id: apiModel.id,
      url: API_BASE,
      npm: "@ai-sdk/openai-compatible",
    },
    capabilities: {
      temperature: true,
      reasoning: isReasoning,
      attachment: false,
      toolcall: true,
      interleaved: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
    },
    cost: {
      input: parseFloat(apiModel.pricing?.prompt || "0") * 1_000_000,
      output: parseFloat(apiModel.pricing?.completion || "0") * 1_000_000,
      cache: {
        read: parseFloat(apiModel.pricing?.cache_prompt || "0") * 1_000_000,
        write: 0,
      },
    },
    limit: {
      context: apiModel.context_length || 128000,
      output: apiModel.max_completion_tokens || 4096,
    },
    status: "active",
    release_date: apiModel.created
      ? new Date(apiModel.created * 1000).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    options: {},
    headers: {},
  };
}

/**
 * OpenCode plugin entry point.
 *
 * @type {import('@opencode-ai/plugin').Plugin}
 */
export async function CrofaiPlugin() {
  return {
    // Inject provider definition into OpenCode's runtime config
    config: async (config) => {
      config.provider = config.provider || {};
      config.provider.crofai = {
        id: PROVIDER_ID,
        name: "CrofAI",
        npm: "@ai-sdk/openai-compatible",
        api: API_BASE,
        env: ["CROFAI_API_KEY"],
      };
    },

    // Dynamically fetch models from CrofAI's /v1/models endpoint
    provider: {
      id: PROVIDER_ID,
      models: async () => {
        try {
          const response = await fetch(`${API_BASE}/models`, {
            headers: { "Content-Type": "application/json" },
          });
          if (!response.ok) {
            console.warn(`[opencode-crofai] /v1/models returned ${response.status}`);
            return {};
          }
          const body = await response.json();
          if (!body.data || !Array.isArray(body.data)) {
            console.warn("[opencode-crofai] Unexpected /v1/models response shape");
            return {};
          }
          const models = {};
          for (const apiModel of body.data) {
            models[apiModel.id] = mapApiModel(apiModel);
          }
          return models;
        } catch (err) {
          console.warn("[opencode-crofai] Failed to fetch models:", err.message);
          return {};
        }
      },
    },

    // Interactive API key auth with env var fallback
    auth: {
      provider: PROVIDER_ID,
      loader: async (getAuth) => {
        const auth = await getAuth();
        if (auth?.type === "api" && auth.key) {
          return { apiKey: auth.key };
        }
        if (process.env.CROFAI_API_KEY) {
          return { apiKey: process.env.CROFAI_API_KEY };
        }
        return {};
      },
      methods: [
        {
          provider: PROVIDER_ID,
          label: "Enter your CrofAI API Key",
          type: "api",
        },
      ],
    },
  };
}
```

- [ ] **Step 2: Commit plugin**

```
git add index.mjs
git commit -m "feat: implement crofai plugin with dynamic model discovery and auth"
```

---

### Task 3: Write README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```md
# opencode-crofai

An [OpenCode](https://opencode.ai) plugin that adds [CrofAI](https://crof.ai) as a first-class provider.

CrofAI provides cheap access to open-weight LLMs. This plugin dynamically discovers available models from CrofAI's API, so you always see the latest models without updating the plugin.

## Installation

```bash
opencode plugin add opencode-crofai
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
- **`provider`** — Fetches `https://crof.ai/v1/models` on startup and maps the response (context length, pricing, reasoning support) to OpenCode's model schema
- **`auth`** — Provides interactive API key entry with automatic `CROFAI_API_KEY` env var fallback

Models are fetched once when the provider loads. If CrofAI adds new models, simply restart OpenCode.

## License

MIT
```

- [ ] **Step 2: Commit README**

```
git add README.md
git commit -m "docs: add README with installation and usage instructions"
```

---

### Task 4: Verify the plugin

- [ ] **Step 1: Check the plugin loads without syntax errors**

```bash
node -e "import('./index.mjs').then(m => console.log(typeof m.CrofaiPlugin))"
```

Expected output: `function`

- [ ] **Step 2: Verify the plugin exports match the Plugin type shape**

```bash
node -e "
const m = await import('./index.mjs');
const hooks = await m.CrofaiPlugin();
console.log('config:', typeof hooks.config);
console.log('provider:', typeof hooks.provider);
console.log('provider.id:', hooks.provider?.id);
console.log('provider.models:', typeof hooks.provider?.models);
console.log('auth:', typeof hooks.auth);
console.log('auth.loader:', typeof hooks.auth?.loader);
console.log('auth.methods:', Array.isArray(hooks.auth?.methods));
"
```

Expected: all `function`/`object` checks should print truthy values.

- [ ] **Step 3: Verify the config hook produces correct provider config**

```bash
node -e "
const m = await import('./index.mjs');
const hooks = await m.CrofaiPlugin();
const cfg = {};
await hooks.config(cfg);
console.log(JSON.stringify(cfg, null, 2));
"
```

Expected:
```json
{
  "provider": {
    "crofai": {
      "id": "crofai",
      "name": "CrofAI",
      "npm": "@ai-sdk/openai-compatible",
      "api": "https://crof.ai/v1",
      "env": ["CROFAI_API_KEY"]
    }
  }
}
```

- [ ] **Step 4: Verify the models hook fetches and maps models correctly**

```bash
node -e "
const m = await import('./index.mjs');
const hooks = await m.CrofaiPlugin();
const models = await hooks.provider.models();
const ids = Object.keys(models);
console.log('Model count:', ids.length);
console.log('Model IDs:', ids.slice(0, 5));
if (ids.length > 0) {
  const sample = models[ids[0]];
  console.log('Sample model cost.input:', sample.cost.input);
  console.log('Sample model cost.output:', sample.cost.output);
  console.log('Sample model limit.context:', sample.limit.context);
  console.log('Sample model capabilities.reasoning:', sample.capabilities.reasoning);
}
"
```

Expected: Should print models from the live CrofAI API with mapped cost values (per-Mtok, not per-token).
