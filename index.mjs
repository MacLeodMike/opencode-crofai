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