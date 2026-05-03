import { describe, it, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { unlink, mkdir, writeFile, readFile, rename } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { CrofaiPlugin } from "../index.mjs";

// Path must match the plugin's cache location
function getCachePath() {
  const xdgCache = process.env.XDG_CACHE_HOME;
  const base = xdgCache || join(homedir(), ".cache");
  return join(base, "opencode", "crofai-models.json");
}

describe("CrofaiPlugin", () => {
  it("exports a function", () => {
    assert.equal(typeof CrofaiPlugin, "function");
  });

  it("returns config, provider, and auth hooks", async () => {
    const hooks = await CrofaiPlugin();
    assert.equal(typeof hooks.config, "function");
    assert.equal(typeof hooks.provider, "object");
    assert.equal(typeof hooks.provider.models, "function");
    assert.equal(typeof hooks.auth, "object");
    assert.equal(typeof hooks.auth.loader, "function");
    assert.ok(Array.isArray(hooks.auth.methods));
  });
});

describe("config hook", () => {
  before(async () => {
    try { await unlink(getCachePath()); } catch { /* no cache to clear */ }
  });

  it("injects the crofai provider definition", async () => {
    const hooks = await CrofaiPlugin();
    const cfg = {};
    await hooks.config(cfg);

    const p = cfg.provider?.crofai;
    assert.equal(p.id, "crofai");
    assert.equal(p.name, "CrofAI");
    assert.equal(p.npm, "@ai-sdk/openai-compatible");
    assert.equal(p.api, "https://crof.ai/v1");
    assert.deepEqual(p.env, ["CROFAI_API_KEY"]);
  });

  it("merges with existing provider configs", async () => {
    const hooks = await CrofaiPlugin();
    const cfg = {
      provider: {
        existing: { id: "existing-provider" },
      },
    };
    await hooks.config(cfg);

    assert.ok(cfg.provider.existing);
    assert.ok(cfg.provider.crofai);
    assert.equal(cfg.provider.crofai.id, "crofai");
  });

  it("injects all models from cache with full config data", async () => {
    const cachePath = getCachePath();
    const cacheDir = join(cachePath, "..");

    // Save existing cache if present
    let hadExisting = false;
    let existingData;
    try {
      existingData = await readFile(cachePath, "utf8");
      hadExisting = true;
    } catch {
      // No existing cache — fine
    }

    const backupPath = hadExisting ? cachePath + ".bak" : null;
    if (hadExisting && backupPath) await rename(cachePath, backupPath);

    const releaseDate = new Date().toISOString().split("T")[0];

    // Write test cache with realistic mapped model data
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify({
        version: 1,
        fetchedAt: new Date().toISOString(),
        models: {
          "deepseek-v4-pro": {
            id: "deepseek-v4-pro",
            providerID: "crofai",
            name: "DeepSeek: DeepSeek V4 Pro",
            api: {
              id: "deepseek-v4-pro",
              url: "https://crof.ai/v1",
              npm: "@ai-sdk/openai-compatible",
            },
            capabilities: {
              temperature: true,
              reasoning: false,
              attachment: false,
              toolcall: true,
              interleaved: false,
              input: { text: true, audio: false, image: false, video: false, pdf: false },
              output: { text: true, audio: false, image: false, video: false, pdf: false },
            },
            cost: { input: 0.4, output: 0.85, cache: { read: 0.08, write: 0 } },
            limit: { context: 1000000, output: 131072 },
            status: "active",
            release_date: releaseDate,
          },
          "kimi-k2.6": {
            id: "kimi-k2.6",
            providerID: "crofai",
            name: "Kimi K2.6",
            api: {
              id: "kimi-k2.6",
              url: "https://crof.ai/v1",
              npm: "@ai-sdk/openai-compatible",
            },
            capabilities: {
              temperature: true,
              reasoning: true,
              attachment: false,
              toolcall: true,
              interleaved: { field: "reasoning_content" },
              input: { text: true, audio: false, image: false, video: false, pdf: false },
              output: { text: true, audio: false, image: false, video: false, pdf: false },
            },
            cost: { input: 0.5, output: 1.99, cache: { read: 0.1, write: 0 } },
            limit: { context: 262144, output: 262144 },
            options: { reasoning_effort: "medium" },
            variants: {
              none: { reasoning_effort: "none" },
              low: { reasoning_effort: "low" },
              medium: { reasoning_effort: "medium" },
              high: { reasoning_effort: "high" },
            },
            status: "active",
            release_date: releaseDate,
          },
        },
      }),
      "utf8",
    );

    try {
      const hooks = await CrofaiPlugin();
      const cfg = {};
      await hooks.config(cfg);

      assert.ok(cfg.provider.crofai);
      assert.ok(cfg.provider.crofai.models);

      // Non-reasoning model SHOULD be injected with full config data
      const nonReasoning = cfg.provider.crofai.models["deepseek-v4-pro"];
      assert.ok(nonReasoning, "non-reasoning model should be injected");
      assert.equal(nonReasoning.id, "deepseek-v4-pro");
      assert.equal(nonReasoning.name, "DeepSeek: DeepSeek V4 Pro");
      assert.equal(nonReasoning.temperature, true);
      assert.equal(nonReasoning.reasoning, false);
      assert.equal(nonReasoning.tool_call, true);
      assert.equal(cfg.provider.crofai.models["deepseek-v4-pro"]?.variants, undefined);

      // Reasoning model SHOULD be injected with variants
      const reasoning = cfg.provider.crofai.models["kimi-k2.6"];
      assert.ok(reasoning, "reasoning model should be injected");
      assert.equal(reasoning.reasoning, true);
      assert.deepEqual(reasoning.variants, {
        none: { reasoning_effort: "none" },
        low: { reasoning_effort: "low" },
        medium: { reasoning_effort: "medium" },
        high: { reasoning_effort: "high" },
      });
      assert.deepEqual(reasoning.options, { reasoning_effort: "medium" });

      // Both models should have proper provider info
      for (const id of ["deepseek-v4-pro", "kimi-k2.6"]) {
        const entry = cfg.provider.crofai.models[id];
        assert.equal(entry.provider.npm, "@ai-sdk/openai-compatible");
        assert.equal(entry.provider.api, "https://crof.ai/v1");
        assert.equal(entry.status, "active");
        assert.equal(entry.limit.context > 0, true);
        assert.equal(entry.limit.output > 0, true);
      }
    } finally {
      try { await unlink(cachePath); } catch {}
      if (backupPath) {
        try { await rename(backupPath, cachePath); } catch {}
      }
    }
  });

  it("falls back to API fetch on cache miss", async () => {
    // Ensure no cache file exists
    try { await unlink(getCachePath()); } catch { /* ok */ }

    const modelId = "kimi-k2.6";
    const variantModelId = "qwen3.5-9b";

    mock.method(global, "fetch", (url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/pricing")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(
            `<script>const visionModels = ["${modelId}"];</script>`,
          ),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: modelId,
              name: "Kimi K2.6",
              context_length: 262144,
              max_completion_tokens: 262144,
              custom_reasoning: true,
              pricing: { prompt: "0.50", completion: "1.99", cache_prompt: "0.10" },
            },
            {
              id: variantModelId,
              name: "Qwen 3.5 9B",
              context_length: 262144,
              max_completion_tokens: 262144,
              custom_reasoning: true,
              pricing: { prompt: "0.04", completion: "0.15", cache_prompt: "0.008" },
            },
          ],
        }),
      });
    });

    try {
      const hooks = await CrofaiPlugin();
      const cfg = {};
      await hooks.config(cfg);

      const models = cfg.provider.crofai.models;
      assert.ok(models, "should inject models from API on cache miss");
      assert.ok(models[modelId], `should include ${modelId}`);
      assert.ok(models[variantModelId], `should include ${variantModelId}`);
      // Should inject variants for reasoning models
      assert.deepEqual(models[modelId].variants, {
        none: { reasoning_effort: "none" },
        low: { reasoning_effort: "low" },
        medium: { reasoning_effort: "medium" },
        high: { reasoning_effort: "high" },
      });
    } finally {
      mock.restoreAll();
      try { await unlink(getCachePath()); } catch { /* ok */ }
    }
  });

  it("rejects cache with mismatched schema version", async () => {
    // Write a cache with wrong version
    const cachePath = getCachePath();
    const cacheDir = join(cachePath, "..");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify({
        version: 999,
        fetchedAt: new Date().toISOString(),
        models: { "stale-model": { id: "stale-model" } },
      }),
      "utf8",
    );

    let fetchCalled = false;
    mock.method(global, "fetch", (url) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/pricing")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<script></script>"),
        });
      }
      fetchCalled = true;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });
    });

    try {
      const hooks = await CrofaiPlugin();
      const cfg = {};
      await hooks.config(cfg);

      // Wrong-version cache should be ignored — fetch should have been called
      assert.ok(fetchCalled, "should fall through to API fetch when version mismatches");
      // Stale model should NOT appear
      assert.equal(cfg.provider.crofai.models?.["stale-model"], undefined);
    } finally {
      mock.restoreAll();
      try { await unlink(cachePath); } catch { /* ok */ }
    }
  });
});

describe("auth hook", () => {
  it("has a single API key method", async () => {
    const hooks = await CrofaiPlugin();
    assert.equal(hooks.auth.methods.length, 1);
    assert.equal(hooks.auth.methods[0].type, "api");
    assert.equal(hooks.auth.methods[0].provider, "crofai");
    assert.equal(
      hooks.auth.methods[0].label,
      "Enter your CrofAI API Key",
    );
  });

  it("returns apiKey from stored auth", async () => {
    const hooks = await CrofaiPlugin();
    const getAuth = async () => ({ type: "api", key: "sk-test-123" });

    const result = await hooks.auth.loader(getAuth);
    assert.deepEqual(result, { apiKey: "sk-test-123" });
  });

  it("falls back to CROFAI_API_KEY env var when no stored auth", async () => {
    const hooks = await CrofaiPlugin();
    const getAuth = async () => undefined;

    process.env.CROFAI_API_KEY = "sk-env-test";
    try {
      const result = await hooks.auth.loader(getAuth);
      assert.deepEqual(result, { apiKey: "sk-env-test" });
    } finally {
      delete process.env.CROFAI_API_KEY;
    }
  });

  it("returns empty object when neither auth nor env var", async () => {
    const hooks = await CrofaiPlugin();
    const getAuth = async () => undefined;

    const result = await hooks.auth.loader(getAuth);
    assert.deepEqual(result, {});
  });

  it("rejects empty string key (falls through to env var)", async () => {
    const hooks = await CrofaiPlugin();
    const getAuth = async () => ({ type: "api", key: "   " });

    // No env var set, so should return empty
    const result = await hooks.auth.loader(getAuth);
    assert.deepEqual(result, {});
  });

  it("prefers stored auth over env var", async () => {
    const hooks = await CrofaiPlugin();
    const getAuth = async () => ({ type: "api", key: "sk-stored" });

    process.env.CROFAI_API_KEY = "sk-env";
    try {
      const result = await hooks.auth.loader(getAuth);
      assert.deepEqual(result, { apiKey: "sk-stored" });
    } finally {
      delete process.env.CROFAI_API_KEY;
    }
  });
});

describe("provider models hook", () => {
  // Clear any cached models so mock-based tests start fresh
  before(async () => {
    try {
      await unlink(getCachePath());
    } catch {
      // File doesn't exist — fine
    }
  });
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns empty object on fetch failure (network error)", async () => {
    mock.method(global, "fetch", () =>
      Promise.reject(new Error("Network failure")),
    );

    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    assert.deepEqual(models, {});
  });

  it("returns empty object on non-200 response", async () => {
    mock.method(global, "fetch", () =>
      Promise.resolve({
        ok: false,
        status: 500,
      }),
    );

    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    assert.deepEqual(models, {});
  });

  it("returns empty object on malformed JSON response", async () => {
    mock.method(global, "fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ notData: true }),
      }),
    );

    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    assert.deepEqual(models, {});
  });

  it("returns empty object when data is not an array", async () => {
    mock.method(global, "fetch", () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: "not-an-array" }),
      }),
    );

    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    assert.deepEqual(models, {});
  });

  const isLive = () => process.env.CROFAI_LIVE_TEST === "1";

  it("successfully fetches and maps models from live API", async () => {
    if (!isLive()) {
      console.warn("  SKIP (set CROFAI_LIVE_TEST=1 to run live API test)");
      return;
    }
    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    const ids = Object.keys(models);
    assert.ok(ids.length > 0, "should fetch at least one model");

    // Verify every model has the required fields
    for (const id of ids) {
      const m = models[id];
      assert.equal(m.providerID, "crofai", `model ${id}: wrong providerID`);
      assert.equal(
        m.api.npm,
        "@ai-sdk/openai-compatible",
        `model ${id}: wrong npm`,
      );
      assert.equal(m.api.url, "https://crof.ai/v1", `model ${id}: wrong url`);
      assert.equal(m.status, "active", `model ${id}: wrong status`);
      assert.ok(
        typeof m.cost.input === "number" && m.cost.input >= 0,
        `model ${id}: invalid cost.input`,
      );
      assert.ok(
        typeof m.cost.output === "number" && m.cost.output >= 0,
        `model ${id}: invalid cost.output`,
      );
      assert.ok(
        typeof m.limit.context === "number" && m.limit.context > 0,
        `model ${id}: invalid limit.context`,
      );
      assert.ok(
        typeof m.limit.output === "number" && m.limit.output > 0,
        `model ${id}: invalid limit.output`,
      );
    }
  });

  it("pricing is per-Mtok (not per-token)", async () => {
    if (!isLive()) {
      console.warn("  SKIP (set CROFAI_LIVE_TEST=1 to run live API test)");
      return;
    }
    const hooks = await CrofaiPlugin();
    const models = await hooks.provider.models();

    for (const [id, m] of Object.entries(models)) {
      // Per-token values like 0.00000050 → per-Mtok should be ~0.50
      // If we see values < 0.0001, the conversion didn't apply
      assert.ok(
        m.cost.input === 0 || m.cost.input > 0.0001,
        `model ${id}: cost.input ${m.cost.input} looks like per-token, not per-Mtok`,
      );
    }
  });
});
