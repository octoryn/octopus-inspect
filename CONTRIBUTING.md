**English** | [简体中文](CONTRIBUTING.zh-CN.md)

# Contributing to Inspect

Thanks for your interest in contributing. This guide covers the basics.

## Development setup

```bash
npm install
npm test        # node --test
npm run example # run the bundled demo workspace
```

Requires Node ≥ 22.

## Before opening a PR

Run the full local gate — CI runs the same checks:

```bash
npm run typecheck      # tsc --noEmit under full strict flags, must be clean
npm run format:check   # prettier
npm run lint           # eslint
npm test               # node --test
npm run build          # emits dist/
```

- **Type safety:** the project is `strict` (with `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`). No `any` escapes unless
  unavoidable and commented.
- **Zero runtime dependencies:** the tool uses Node built-ins only. Do not add a
  runtime dependency without a very strong reason.
- **Boundaries are the point.** Inspect is a static rule host: it must never
  execute the workspace, import a runtime, reach the network, or modify a file.
  Built-in rules are **static and self-contained** — a rule that needs a specific
  runtime's semantics belongs in a **plugin**, not the built-ins, so "safe" stays
  defined in one place. A PR that crosses those lines will be declined regardless
  of quality.
- **Determinism.** Rules must be pure: the same workspace produces the same
  findings in the same order. No wall-clock, no randomness, no ordering that
  depends on the filesystem's iteration order in assertions.
- **Tests:** new behavior needs tests, and they must be hermetic (no network,
  unique temp dirs, cleaned up).

## Adding or changing a rule

- A rule is a `{ id, title, description, severity, check }` object. `check`
  receives the `Workspace` and returns `RawFinding[]` — the engine attaches the
  `ruleId` and resolves the effective severity, so a rule only describes *where*
  and *what*.
- Keep rule ids stable and kebab-case; they are a public contract (config keys,
  SARIF rule ids). Renaming one is a breaking change.
- Redact anything sensitive in an `excerpt` — a report must never echo a full
  credential.
- Prefer the shared JSON helpers (`parsedJsonFiles`, `walkJson`, `findKeyLine`,
  `keyMatches`) over ad-hoc parsing so line lookup and JSONC handling stay
  consistent.

## Project layout

See [docs/DESIGN.md](docs/DESIGN.md) for the authoritative architecture, the
pipeline, and the boundaries. Code is written against that spec; update it first
when contracts change.

## Commit / PR

- Keep PRs focused. Describe what changed and why.
- Update `CHANGELOG.md` for user-facing changes.
- Update the relevant docs (`README.md`, `docs/`) when you change the public API
  or CLI surface. Docs are bilingual (English canonical + `*.zh-CN.md` sibling);
  update both when practical.

## Reporting bugs / security issues

File a normal issue for bugs. For security vulnerabilities, follow
[SECURITY.md](SECURITY.md) instead of opening a public issue.
