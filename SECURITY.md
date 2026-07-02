**English** | [简体中文](SECURITY.zh-CN.md)

# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Report privately via GitHub Security Advisories ("Report a vulnerability" on the
repository's Security tab) or email **security@octopusos.ai**. Include a
description, reproduction steps, and impact. We aim to acknowledge within a few
business days.

## Scope notes

Inspect is a **static governance linter**: it reads a workspace on disk and
reports findings. A few areas are security-relevant by design:

- **Untrusted input.** Inspect runs over arbitrary, possibly hostile files. It
  must never crash on malformed content — a file that fails to parse as JSON is
  skipped, not fatal, and a run over any tree returns a report rather than
  throwing. Report any input that throws, hangs, or pollutes a prototype.
- **No execution, no egress.** Inspect does **not** execute the workspace, import
  a runtime, follow symlinks, or perform any network I/O while scanning. The one
  exception is **plugins**: a plugin is a module Inspect `import`s and whose
  `check` it runs, so a plugin executes with the privileges of the process. Only
  configure plugins you trust — treat `plugins` in `.octoinspect.json` like any
  other code dependency.
- **Findings can echo sensitive content.** A finding may quote a short,
  **redacted** excerpt of the offending line (secrets are redacted before they
  reach the report), but a `json` or `sarif` artifact still contains file paths,
  line numbers, and messages about your workspace. Treat inspection output as you
  would any static-analysis report — scope who can read the CI artifact.
- **Detection is heuristic, not exhaustive.** The built-in rules flag common
  shapes of a governance hole; a clean run is not a proof of safety, and a
  finding is not a proof of exploitability. Inspect is one gate, not the whole
  fence.

## Supported versions

This project is pre-1.0; only the latest version receives fixes.
