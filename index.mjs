/**
 * OpenCode CrofAI Plugin
 *
 * Registers CrofAI as a first-class provider with:
 * - Dynamic model discovery from /v1/models
 * - Disk cache for instant startup + background refresh
 * - Interactive API key auth with env var fallback
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const API_BASE = "https://crof.ai/v1";
const PROVIDER_ID = "crofai";
const LOG_PREFIX = "[oc-crofai]";

// Resolve cache directory: $XDG_CACHE_HOME/opencode or ~/.cache/opencode
function getCacheDir() {
  const home = homedir();
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache || join(home, ".cache");
  return join(base, "opencode");
}

const CACHE_FILE = join(getCacheDir(), "crofai-models.json");

// Guards against concurrent background refreshes
let refreshInProgress = false;

/**
 * Safely parse a CrofAI pricing string.
 * CrofAI already returns per-Mtok values; return as-is.
 * Returns 0 for missing, NaN, or negative values.
 */
function parseCost(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Map a CrofAI API model object to OpenCode's ModelV2 schema.
 * CrofAI returns pricing as per-Mtok floats (e.g. 0.50 = $0.50/Mtok).
 *
 * CrofAI supports reasoning_effort on reasoning-capable models (indicated
 * by either `reasoning_effort: true` or `custom_reasoning: true` in the
 * API response). Accepted values: "low", "medium", "high", or "none"
 * (disables reasoning entirely).
 */
export function mapApiModel(apiModel) {
  if (!apiModel || typeof apiModel !== "object") {
    throw new TypeError("mapApiModel requires an object");
  }
  if (!apiModel.id || typeof apiModel.id !== "string") {
    throw new TypeError("mapApiModel: model must have a string id");
  }

  const isReasoning = !!(apiModel.reasoning_effort || apiModel.custom_reasoning);
  const modelId = apiModel.id;

  const model = {
    id: modelId,
    providerID: PROVIDER_ID,
    name: apiModel.name || modelId,
    api: {
      id: modelId,
      url: API_BASE,
      npm: "@ai-sdk/openai-compatible",
    },
    capabilities: {
      temperature: true,
      reasoning: isReasoning,
      attachment: false,
      toolcall: true,
      interleaved: isReasoning
        ? { field: "reasoning_content" }
        : false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
    },
    cost: {
      input: parseCost(apiModel.pricing?.prompt),
      output: parseCost(apiModel.pricing?.completion),
      cache: {
        read: parseCost(apiModel.pricing?.cache_prompt),
        write: 0,
      },
    },
    limit: {
      context:
        typeof apiModel.context_length === "number" && apiModel.context_length > 0
          ? apiModel.context_length
          : 128000,
      output:
        typeof apiModel.max_completion_tokens === "number" &&
        apiModel.max_completion_tokens > 0
          ? apiModel.max_completion_tokens
          : 16384,
    },
    status: "active",
    release_date: apiModel.created
      ? new Date(apiModel.created * 1000).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
  };

  // All reasoning models support adjustable reasoning_effort
  // per CrofAI docs: low, medium, high, or none (disables reasoning)
  if (isReasoning) {
    model.options = { reasoning_effort: "medium" };
    model.variants = {
      none: { reasoning_effort: "none" },
      low: { reasoning_effort: "low" },
      medium: { reasoning_effort: "medium" },
      high: { reasoning_effort: "high" },
    };
  }

  return model;
}

/**
 * Fetch models from CrofAI's /v1/models API and map them.
 * Returns null on failure.
 */
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 3_600_000; // 1 hour

async function fetchModelsFromAPI() {
  const response = await fetch(`${API_BASE}/models`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.warn(`${LOG_PREFIX} /v1/models returned ${response.status}`);
    return null;
  }
  const body = await response.json();
  if (!body.data || !Array.isArray(body.data)) {
    console.warn(`${LOG_PREFIX} Unexpected /v1/models response shape`);
    return null;
  }
  const models = {};
  for (const apiModel of body.data) {
    models[apiModel.id] = mapApiModel(apiModel);
  }
  return Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Read cached models from disk. Returns null if cache is missing or corrupt.
 */
async function readModelCache() {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.models && typeof parsed.models === "object") {
      const age = Date.now() - new Date(parsed.fetchedAt).getTime();
      if (age < CACHE_TTL_MS) {
        return parsed.models;
      }
    }
  } catch {
    // File doesn't exist or is corrupt — that's fine
  }
  return null;
}

/**
 * Write mapped models to disk cache.
 */
async function writeModelCache(models) {
  try {
    await mkdir(getCacheDir(), { recursive: true });
    await writeFile(
      CACHE_FILE,
      JSON.stringify({ fetchedAt: new Date().toISOString(), models }),
      "utf8",
    );
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to write model cache:`, err.message);
  }
}

/**
 * Fire-and-forget: fetch fresh models from API and update the cache.
 * Used after returning stale cache so the next call sees fresh data.
 */
async function refreshModelsInBackground() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const fresh = await fetchModelsFromAPI();
    if (fresh) {
      await writeModelCache(fresh);
      console.log(`${LOG_PREFIX} Background model refresh complete`);
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Background refresh failed:`, err.message);
  } finally {
    refreshInProgress = false;
  }
}

/**
 * OpenCode plugin entry point.
 *
 * @type {import('@opencode-ai/plugin').Plugin}
 */
export async function CrofaiPlugin() {
  return {
    // Inject provider definition into OpenCode's runtime config.
    // Also inject model variants from cache so OpenCode's processing
    // pipeline preserves them (it uses config-defined variants in its
    // second pass, not plugin-returned model variants).
    config: async (config) => {
      config.provider = config.provider || {};
      config.provider.crofai = {
        id: PROVIDER_ID,
        name: "CrofAI",
        npm: "@ai-sdk/openai-compatible",
        api: API_BASE,
        env: ["CROFAI_API_KEY"],
      };

      // Inject per-model variants from cache so OpenCode preserves them
      const cached = await readModelCache();
      if (cached) {
        config.provider.crofai.models = {};
        for (const [id, model] of Object.entries(cached)) {
          if (model.variants) {
            config.provider.crofai.models[id] = { variants: model.variants };
          }
        }
      }
    },

    // Fetch models with cache-first + background refresh strategy.
    // If a cached model list exists, return it immediately and refresh
    // in the background.  If no cache, block on the API call.
    provider: {
      id: PROVIDER_ID,
      models: async () => {
        // Try cache first
        const cached = await readModelCache();
        if (cached) {
          // Return stale cache instantly, refresh in background
          refreshModelsInBackground();
          return cached;
        }

        // No cache — fetch from API (this blocks)
        try {
          const models = await fetchModelsFromAPI();
          if (models) {
            writeModelCache(models); // fire-and-forget
            return models;
          }
        } catch (err) {
          console.warn(`${LOG_PREFIX} Failed to fetch models:`, err.message);
        }
        return {};
      },
    },

    // Interactive API key auth with env var fallback
    auth: {
      provider: PROVIDER_ID,
      loader: async (getAuth) => {
        const auth = await getAuth();
        if (auth?.type === "api" && auth.key?.trim()) {
          return { apiKey: auth.key.trim() };
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
