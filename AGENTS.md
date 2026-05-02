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
- 1-hour TTL; background refresh returns stale cache immediately then fetches fresh
- Guard against concurrent background refreshes (`refreshInProgress` flag)

## Variants (model.cycle)

- **Problem**: OpenCode's `dJ()` function returns `{}` for CrofAI models ("kimi" is in the exclusion list, and `@ai-sdk/openai-compatible` has no case in the switch). It also runs a second pass that overwrites `model.variants` with `dJ()` output, **discarding plugin-provided variants**.
- **Fix**: The `config` hook reads the cache and injects `config.provider.crofai.models[id] = { variants }` for every cached model that has variants. OpenCode's config processing preserves these because it reads `f?.models?.[k]?.variants` (config-defined) and merges them.
- **First startup**: No cache exists, so no variants are injected on the very first run. They appear on the second startup.
- Requires a cache hit before variant injection works.

## Testing

- Tests use `node:test` and `node:assert/strict` — no external test framework
- `mapApiModel()` exported as named function for direct unit testing
- Two test files: `test/map-api-model.test.js` (pure unit, no mocking needed) and `test/plugin.test.js` (hook integration, mocks `global.fetch`)
- Live API tests verify every model has valid `providerID`, `api`, `status`, `cost`, and `limit` fields
- Clear `~/.cache/opencode/crofai-models.json` before mock-based plugin tests (`plugin.test.js` does this in `before` hook, using `getCachePath()` which respects `XDG_CACHE_HOME`)
