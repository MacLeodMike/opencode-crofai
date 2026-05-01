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
 * Safely parse a CrofAI pricing string to a per-Mtok number.
 * Returns 0 for missing, NaN, or negative values.
 */
function parseCost(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : 0;
}

/**
 * Map a CrofAI API model object to OpenCode's ModelV2 schema.
 * CrofAI returns per-token pricing; OpenCode stores per-Mtok.
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
          : 4096,
    },
    status: "active",
    release_date: apiModel.created
      ? new Date(apiModel.created * 1000).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    options: undefined,
    headers: undefined,
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
        if (auth?.type === "api" && auth.key?.trim()) {
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