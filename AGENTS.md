# oc-crofai — Agent Instructions

Plugin adding [CrofAI](https://crof.ai) as an OpenCode provider. Single-file ESM module, no build step.

## Commands

- `npm test` — runs `node --test` (Node.js built-in test runner, not jest/vitest)
- Run single test file: `node --test test/map-api-model.test.js`
- Live API tests require `CROFAI_LIVE_TEST=1` (skipped by default)
- CI: Node 22, `npm ci`, `npm test`
- Publish: push `v*` tag → GitHub Actions runs `npm publish --provenance --access public`

## Architecture

- **Entrypoint**: `index.mjs` exports `CrofaiPlugin()` (async, returns `{ config, provider, auth }`)
- **Provider SDK**: `@ai-sdk/openai-compatible` (configured via `config` hook's `npm` field, not imported directly)
- **Dev dep**: `@opencode-ai/plugin` — types via JSDoc (`@type {import('@opencode-ai/plugin').Plugin}`), no `.d.ts` shipped
- **No TypeScript**, no lint config, no formatter, no local `opencode.json`
- **Auth env var**: `CROFAI_API_KEY` (fallback when no stored auth; stored auth takes priority)

## Pricing

CrofAI returns **per-Mtok** values (e.g. `0.50` = $0.50/Mtok). `parseCost` passes them through as-is. Do NOT multiply by 1,000,000 — `docs/superpowers/specs/` and `docs/superpowers/plans/` contain outdated designs that say to multiply; the code in `index.mjs` is correct.

## Model Mapping

- **Reasoning detection**: either `reasoning_effort: true` OR `custom_reasoning: true` in API response triggers four variants (none/low/medium/high) plus `capabilities.interleaved: { field: "reasoning_content" }`
- **Defaults**: context 128K, output 16K, status `"active"` — only overridden when API returns positive values
- **Release date**: from `created` (Unix timestamp) or today's date if missing
- **Sorting**: models sorted alphabetically by `id` for consistent ordering
- **Fetch timeout**: 10s (`AbortSignal.timeout(10_000)`)

## Cache

- Path: `$XDG_CACHE_HOME/opencode/crofai-models.json` (or `~/.cache/opencode/`), respecting `XDG_CACHE_HOME`
- Schema version: `CACHE_SCHEMA_VERSION = 1` — written into cache file, checked on read; mismatched versions are discarded so stale caches from older plugin releases don't cause issues
- 1-hour TTL; background refresh returns stale cache immediately then fetches fresh
- Guard against concurrent background refreshes (`refreshInProgress` flag)

## Vision Detection

- **Problem**: CrofAI's `/v1/models` API doesn't return a vision flag. The pricing page at `https://crof.ai/pricing` embeds a `const visionModels = [...]` array in its JS.
- **Fix**: `fetchVisionModels()` scrapes the pricing page HTML with a regex to extract the list, then `mapApiModel(apiModel, visionModels)` checks the Set to set `attachment: true` and `input.image: true`. Fetched in parallel with the models API so it doesn't add latency.
- **Fallback**: If the pricing page fetch fails, vision defaults to `false` for all models.
- **Cached**: Vision info is stored as part of the model objects in the disk cache.

## Config Hook: Model Registration

- **Context**: CrofAI is a custom plugin (not in OpenCode's built-in `modelsDev`). OpenCode's plugin model loading path (`provider.ts:1152-1153`) requires the provider to already exist in the database, which fails for custom plugins. The only path models reach OpenCode is through the config hook.
- **Problem (old)**: The config hook only injected models that had `variants` (reasoning models), so non-reasoning models had zero representation in OpenCode's config processing path and were silently dropped.
- **Fix**: The config hook injects **all models** into `config.provider.crofai.models` with full config model data (`id`, `name`, `status`, `temperature`, `reasoning`, `tool_call`, `modalities`, `cost`, `limit`, `provider`, etc.). Models with variants also include their `options` and `variants` fields. OpenCode's config processing (`provider.ts:1183-1262`) creates proper database entries from this data, regardless of whether a model has variants.

## Variants

- **Problem**: OpenCode's `ProviderTransform.variants()` returns `{}` for CrofAI models ("kimi" is in the exclusion list at `transform.ts:452`, and `@ai-sdk/openai-compatible` has no case in the switch).
- **Fix**: Variants are baked into the cache and injected via the config hook's model entries. OpenCode's config processing preserves these because it reads `configProvider?.models?.[modelID]?.variants` and merges them with `mergeDeep`.

## Testing

- Tests use `node:test` and `node:assert/strict` — no external test framework
- `mapApiModel()` exported as named function for direct unit testing
- Two test files: `test/map-api-model.test.js` (pure unit, no mocking needed) and `test/plugin.test.js` (hook integration, mocks `global.fetch`)
- Live API tests verify every model has valid `providerID`, `api`, `status`, `cost`, and `limit` fields
- Clear `~/.cache/opencode/crofai-models.json` before mock-based plugin tests (`plugin.test.js` does this in `before` hook, using `getCachePath()` which respects `XDG_CACHE_HOME`)
