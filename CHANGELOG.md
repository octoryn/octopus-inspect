**English** | [简体中文](CHANGELOG.zh-CN.md)

# Changelog

All notable changes to Inspect are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims to follow
semantic versioning once it reaches 1.0.

## [0.3.2] — 2026-07-03

### Added

- **Reference semantic plugin — `runtime-policy` — proving the "rule host" thesis.**
  A worked example (`inspect-plugins/runtime-policy.ts` + `docs/PLUGINS.md`) shows
  how a semantic check that a static linter can't do lives in a plugin owned by
  the runtime whose semantics it enforces. Its `runtime-over-autonomy` rule flags
  a side-effecting tool granted autonomy above the safe ceiling with no gate —
  and the ceiling is **computed from octopus-runtime's real `AutonomyLevel`
  ordering** (`routeExecutes(routeFor(...))`), not a hard-coded copy that could
  drift. Loaded through inspect's real plugin loader. The plugin source/fixtures
  are repo-local (not in the npm tarball, and `octopus-runtime` is a
  devDependency only); `docs/PLUGINS.md` ships as the authoring guide.

### Fixed

- **Reference plugin: a declared-but-empty gate no longer silences the rule.**
  `hasExplicitGate` treated an empty string / `0` / empty object as a real
  policy gate, so `{ autonomy: "autonomous", execute: "…", policy: "" }` slipped
  through as a false negative. It now requires a meaningful gate value. Found by
  adversarial review; regression-tested.

## [0.3.1] — 2026-07-03

### Added

- **Drop-in GitHub Action.** A composite `action.yml` (`octoryn/octopus-inspect@v0.3.1`)
  runs the linter in CI and writes SARIF, so findings land in a repo's Security
  tab in a few lines. Inputs `path` / `args` / `version` / `sarif-file` /
  `fail-on-findings`; the copy-paste consumer workflow (pairing it with
  `github/codeql-action/upload-sarif`) is in the README. A `self-scan.yml`
  workflow dogfoods it against this repo.

### Fixed

- **Repo-root `.octoinspect.json` no longer breaks a whole-repo scan.** The
  example config actively referenced a plugin (`./inspect-plugins/runtime-policy.js`)
  that does not exist, so `octopus-inspect .` at the repo root failed with a
  config error (exit 2) — the linter couldn't scan its own repository. The
  dangling `plugins` entry is now commented out (kept as example syntax).

## [0.3.0] — 2026-07-03

### Added

- **`--format evidence` reporter.** Every finding can now be emitted as an
  independently-verifiable [`octopus-evidence`](https://github.com/octoryn/octopus-evidence)
  `Evidence` — `kind = governance-finding:<ruleId>`, subject = the file/location,
  content = the canonical finding detail (severity, message, line/col, OWASP
  tags), provenance = `{ source: "octopus-inspect", method: "static-analysis" }`.
  Anyone can recompute the hash and confirm what governance holes existed at a
  commit **without trusting the linter** — the EU AI Act Art. 12/14 audit story.
  New exports `reportEvidence` / `formatEvidence` / `findingToEvidence`; an
  optional `integritySecret` seals the record under a keyed HMAC. The reporter
  core is deterministic (injectable clock; never calls `Date.now()` at module
  scope). Existing `pretty` / `json` / `sarif` output, rule ids, and finding
  semantics are unchanged.

### Changed

- Now depends on the first-party `octopus-evidence@^0.2.0` — its **only** runtime
  dependency (still zero third-party deps). README/DESIGN reframed to "built on
  the first-party octopus-evidence primitive."

## [0.2.0] — 2026-07-03

### Added

- **OWASP Top 10 for Agentic Applications (2026) mapping.** Every built-in rule
  now declares the ASI category it addresses (a new optional `owasp` field on the
  `Rule` contract). Exported as `OWASP_AGENTIC_2026` / `owaspLabel` and surfaced
  in SARIF rule metadata (`properties.tags`, e.g. `OWASP-ASI-2026:ASI01`) so
  findings map onto the shared security taxonomy for code scanning.

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
