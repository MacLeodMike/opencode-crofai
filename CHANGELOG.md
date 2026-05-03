# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.4] — 2026-05-03

### Fixed

- Non-reasoning models (e.g. `deepseek-v4-pro`) no longer disappear from the
  model list. The config hook now injects **all models** (not just reasoning
  models) with full config data (`id`, `name`, `status`, `temperature`,
  `reasoning`, `tool_call`, `modalities`, `cost`, `limit`, `provider`).
  Reasoning models also include `options` and `variants`. Non-reasoning models
  were previously silently dropped because CrofAI is a custom plugin — it
  doesn't appear in OpenCode's built-in `modelsDev`, so the plugin's
  `provider.models()` hook was never called, and the config hook was the only
  path models could reach OpenCode.

## [0.4.3] — 2026-05-03

### Changed

- README removal instructions now include deleting the model cache file.
- Restored variant credit for teppyboy's approach in README.

## [0.4.2] — 2026-05-02

### Changed

- Toned down feature descriptions in README.

## [0.4.1] — 2026-05-02

### Changed

- Updated README to document v0.4.0 features (vision detection, cache schema).

## [0.4.0] — 2026-05-02

### Added

- **Vision model detection** — `fetchVisionModels()` scrapes CrofAI's pricing
  page for the `visionModels` JS array, eliminating the need for a hardcoded
  list. Enabled models get `capabilities.attachment: true` and
  `capabilities.input.image: true`. Runs in parallel with the models API fetch
  so it doesn't add latency.
- **Cache schema version** — `CACHE_SCHEMA_VERSION` (currently `1`) is written
  into the cache file and checked on read. Mismatched versions are discarded,
  preventing issues from stale caches across plugin releases.
- **Config hook cache-miss fallthrough** — The config hook now falls through to
  an API fetch on cache miss, so model variants work on first run without
  waiting for the cache to be populated.

### Changed

- Cache and API errors use `console.warn` with `[oc-crofai]` prefix instead of
  bare `console.error`.

## [0.3.0] — 2026-05-02

### Added

- **Model variants via config hook** — Reasoning model variants
  (none/low/medium/high) are now injected through OpenCode's `config` hook
  rather than relying on `ProviderTransform.variants()`, which returns `{}` for
  CrofAI models (the "kimi" family is in the exclusion list at
  `transform.ts:452`, and `@ai-sdk/openai-compatible` has no case in the
  switch). Variants are baked into the cache and preserved through OpenCode's
  config processing pipeline.

## [0.2.1] — 2026-05-01

### Fixed

- **Pricing multiplier removed** — CrofAI already returns per-Mtok values
  (e.g. `0.50` = $0.50/Mtok). The incorrect multiplication by 1,000,000 was
  removed. `parseCost` now passes values through as-is.

### Changed

- Updated README with latest features and corrected install command.

## [0.2.0] — 2026-05-01

### Added

- **Disk cache with background refresh** — Models are cached to
  `~/.cache/opencode/crofai-models.json` for instant startup. Stale cache is
  returned immediately, then fresh data is fetched in the background so
  subsequent calls see the latest models.
- **1-hour cache TTL** — Stale caches are discarded and re-fetched
  automatically.
- **10s fetch timeout** — Uses `AbortSignal.timeout(10_000)` to prevent hangs.
- **Alphabetical model sorting** — Models sorted by `id` for consistent UI
  ordering.
- **Auth key whitespace trimming** — API key is trimmed before use.
- **GitHub Actions CI** — Tests run on push/PR to main. Publishing uses
  trusted publishing with npm provenance (`--provenance --access public`),
  triggered by `v*` tags.

### Changed

- Default output limit raised from 4096 to 16384.
- Log prefix standardized to `[oc-crofai]`.
- Internal fields no longer include explicit `undefined` values in model
  objects.

### Fixed

- Auth: empty-string keys (whitespace-only) no longer pass validation; fall
  through to env var or empty response correctly.

## [0.1.0] — 2026-04-30

### Added

- Initial plugin implementation with `CrofaiPlugin()` entry point.
- Dynamic model discovery from `https://crof.ai/v1/models` — maps model IDs,
  context length, pricing, and reasoning capabilities to OpenCode's model
  schema.
- Reasoning effort variants (none/low/medium/high) for all
  reasoning-capable models.
- Interactive API key auth with `CROFAI_API_KEY` env var fallback.
- `mapApiModel()` exported for direct unit testing with 26 test cases.
- Provider SDK integration via `@ai-sdk/openai-compatible`.

[Unreleased]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.4.4...HEAD
[0.4.4]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/MacLeodMike/opencode-crofai/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MacLeodMike/opencode-crofai/commit/2b8f316
