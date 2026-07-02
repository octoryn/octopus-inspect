**English** | [简体中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to Inspect are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning once it reaches 1.0.

## [0.1.0] — 2026-07-03

First public release.

### Added
- **Inspection engine** (`inspect`) — walks a workspace directory (or a single
  file), runs governance rules over it, and returns a deterministic
  `InspectReport` (`root`, sorted `findings`, `fileCount`, `ruleCount`, and a
  per-severity `summary`). Same bytes on disk → identical findings in identical
  order. `shouldFail(report, threshold)` decides the exit condition.
- **Seven built-in rules**, all static and self-contained:
  `secret-in-source` (error), `prompt-injection-sink` (warning),
  `unsafe-autonomy` (error, structural), `overbroad-permission` (warning),
  `missing-evidence` (warning, structural), `circular-workflow` (error), and
  `unpinned-agent-dependency` (info).
- **Plugin host** — Inspect is a *rule host*. Runtimes contribute semantic
  checks as plugins (`definePlugin({ name, rules })`), referenced from config
  and merged with the built-ins. Duplicate rule ids are rejected; a plugin that
  fails to load is a reported configuration error rather than a crash.
- **Three reporters:** `pretty` (human-readable, TTY-colorized), `json`
  (machine-readable), and `sarif` (SARIF 2.1.0 for GitHub code scanning and any
  SARIF-aware tool). `formatPretty` / `formatJson` / `formatSarif` are exported.
- **CLI** (`octopus-inspect`) with `--format`, `--config`, `--threshold`,
  `--no-color`, `--version`, and `--help`. Exit codes: `0` clean, `1` findings
  at or above the threshold, `2` configuration error.
- **Configuration** via `.octoinspect.json` (JSONC): `ignore` globs, per-rule
  severity overrides and `off`, `plugins`, and `maxFileBytes`. A malformed or
  absent config falls back to defaults rather than failing.
- **JSON / JSONC / text / Markdown scanning**, with `parseJsonc`, `walkJson`,
  `isJsonObject`, and `findKeyLine` helpers exported for authoring structural
  plugin rules.
- **Zero runtime dependencies**; Node ≥ 22. Open-source release packaging to the
  Octoryn ecosystem standard: full `package.json` metadata, bilingual docs
  (English canonical + `*.zh-CN.md` siblings with a language switcher), README
  badges, a design doc, and `SECURITY.md` / `CONTRIBUTING.md` /
  `CODE_OF_CONDUCT.md`.
