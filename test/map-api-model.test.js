import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapApiModel } from "../index.mjs";

// Sample CrofAI API responses (representative of the live API)
const reasoningEffortModel = {
  id: "kimi-k2.6",
  name: "MoonshotAI: Kimi K2.6",
  context_length: 262144,
  max_completion_tokens: 262144,
  reasoning_effort: true,
  custom_reasoning: false,
  created: 1776737314,
  pricing: {
    prompt: "0.50",
    completion: "1.99",
    cache_prompt: "0.10",
  },
};

const customReasoningModel = {
  id: "qwen3.5-397b-a17b",
  name: "Qwen: Qwen3.5 397B A17B",
  context_length: 262144,
  max_completion_tokens: 262144,
  custom_reasoning: true,
  created: 1771526845,
  pricing: {
    prompt: "0.35",
    completion: "1.75",
    cache_prompt: "0.07",
  },
};

const nonReasoningModel = {
  id: "deepseek-v4-pro",
  name: "DeepSeek: DeepSeek V4 Pro",
  context_length: 1000000,
  max_completion_tokens: 131072,
  created: 1777097940,
  pricing: {
    prompt: "0.40",
    completion: "0.85",
    cache_prompt: "0.08",
  },
};

const minimalModel = {
  id: "greg",
  pricing: {},
};

describe("mapApiModel", () => {
  it("rejects null input", () => {
    assert.throws(() => mapApiModel(null), TypeError);
  });

  it("rejects non-object input", () => {
    assert.throws(() => mapApiModel("string"), TypeError);
  });

  it("rejects object without string id", () => {
    assert.throws(() => mapApiModel({}), TypeError);
    assert.throws(() => mapApiModel({ id: 123 }), TypeError);
  });

  it("maps basic fields for a non-reasoning model", () => {
    const result = mapApiModel(nonReasoningModel);

    assert.equal(result.id, "deepseek-v4-pro");
    assert.equal(result.providerID, "crofai");
    assert.equal(result.name, "DeepSeek: DeepSeek V4 Pro");
    assert.equal(result.api.id, "deepseek-v4-pro");
    assert.equal(result.api.url, "https://crof.ai/v1");
    assert.equal(result.api.npm, "@ai-sdk/openai-compatible");
    assert.equal(result.status, "active");
  });

  it("passes through per-Mtok pricing as-is", () => {
    const result = mapApiModel(nonReasoningModel);

    assert.equal(result.cost.input, 0.4);
    assert.equal(result.cost.output, 0.85);
    assert.equal(result.cost.cache.read, 0.08);
    assert.equal(result.cost.cache.write, 0);
  });

  it("handles missing pricing gracefully", () => {
    const result = mapApiModel(minimalModel);

    assert.equal(result.cost.input, 0);
    assert.equal(result.cost.output, 0);
    assert.equal(result.cost.cache.read, 0);
  });

  it("handles negative pricing (returns 0)", () => {
    const result = mapApiModel({
      id: "test",
      pricing: { prompt: "-1.0", completion: "NaN", cache_prompt: "invalid" },
    });

    assert.equal(result.cost.input, 0);
    assert.equal(result.cost.output, 0);
    assert.equal(result.cost.cache.read, 0);
  });

  it("maps context and output limits", () => {
    const result = mapApiModel(nonReasoningModel);

    assert.equal(result.limit.context, 1000000);
    assert.equal(result.limit.output, 131072);
  });

  it("provides sensible defaults when limits are missing", () => {
    const result = mapApiModel(minimalModel);

    assert.equal(result.limit.context, 128000);
    assert.equal(result.limit.output, 16384);
  });

  it("rejects non-positive limits", () => {
    const result = mapApiModel({
      id: "test",
      context_length: 0,
      max_completion_tokens: -1,
    });

    assert.equal(result.limit.context, 128000);
    assert.equal(result.limit.output, 16384);
  });

  it("converts created timestamp to ISO date", () => {
    const result = mapApiModel(nonReasoningModel);

    // 1777097940 → should be a date in 2026
    assert.match(result.release_date, /^2026-\d{2}-\d{2}$/);
  });

  it("uses today's date when created is missing", () => {
    const result = mapApiModel(minimalModel);

    const today = new Date().toISOString().split("T")[0];
    assert.equal(result.release_date, today);
  });

  it("sets default capabilities", () => {
    const result = mapApiModel(nonReasoningModel);

    assert.equal(result.capabilities.temperature, true);
    assert.equal(result.capabilities.reasoning, false);
    assert.equal(result.capabilities.attachment, false);
    assert.equal(result.capabilities.toolcall, true);
    assert.equal(result.capabilities.interleaved, false);
    assert.deepEqual(result.capabilities.input, {
      text: true, audio: false, image: false, video: false, pdf: false,
    });
    assert.deepEqual(result.capabilities.output, {
      text: true, audio: false, image: false, video: false, pdf: false,
    });
  });

  describe("reasoning_effort models", () => {
    it("sets reasoning to true", () => {
      const result = mapApiModel(reasoningEffortModel);
      assert.equal(result.capabilities.reasoning, true);
    });

    it("sets interleaved for reasoning token streaming", () => {
      const result = mapApiModel(reasoningEffortModel);
      assert.deepEqual(result.capabilities.interleaved, {
        field: "reasoning_content",
      });
    });

    it("sets default reasoning_effort to medium", () => {
      const result = mapApiModel(reasoningEffortModel);
      assert.deepEqual(result.options, { reasoning_effort: "medium" });
    });

    it("creates four variants: none, low, medium, high", () => {
      const result = mapApiModel(reasoningEffortModel);
      assert.deepEqual(result.variants, {
        none: { reasoning_effort: "none" },
        low: { reasoning_effort: "low" },
        medium: { reasoning_effort: "medium" },
        high: { reasoning_effort: "high" },
      });
    });
  });

  describe("custom_reasoning models", () => {
    it("sets reasoning to true", () => {
      const result = mapApiModel(customReasoningModel);
      assert.equal(result.capabilities.reasoning, true);
    });

    it("sets interleaved for reasoning token streaming", () => {
      const result = mapApiModel(customReasoningModel);
      assert.deepEqual(result.capabilities.interleaved, {
        field: "reasoning_content",
      });
    });

    it("sets default reasoning_effort to medium", () => {
      const result = mapApiModel(customReasoningModel);
      assert.deepEqual(result.options, { reasoning_effort: "medium" });
    });

    it("creates four variants: none, low, medium, high", () => {
      const result = mapApiModel(customReasoningModel);
      assert.deepEqual(result.variants, {
        none: { reasoning_effort: "none" },
        low: { reasoning_effort: "low" },
        medium: { reasoning_effort: "medium" },
        high: { reasoning_effort: "high" },
      });
    });
  });

  it("uses id as fallback name when name is missing", () => {
    const result = mapApiModel({ id: "foo" });
    assert.equal(result.name, "foo");
  });
});
