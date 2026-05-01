import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { CrofaiPlugin } from "../index.mjs";

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
  it("injects the crofai provider definition", async () => {
    const hooks = await CrofaiPlugin();
    const cfg = {};
    await hooks.config(cfg);

    assert.deepEqual(cfg.provider?.crofai, {
      id: "crofai",
      name: "CrofAI",
      npm: "@ai-sdk/openai-compatible",
      api: "https://crof.ai/v1",
      env: ["CROFAI_API_KEY"],
    });
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

  it("successfully fetches and maps models from live API", async () => {
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
