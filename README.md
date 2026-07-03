**English** | [简体中文](README.zh-CN.md)

# Inspect

[![CI](https://github.com/octoryn/octopus-inspect/actions/workflows/ci.yml/badge.svg)](https://github.com/octoryn/octopus-inspect/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/octoryn/octopus-inspect?sort=semver)](https://github.com/octoryn/octopus-inspect/releases/latest)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)
[![Built on octopus-evidence](https://img.shields.io/badge/built%20on-octopus--evidence-7c9cff.svg)](https://github.com/octoryn/octopus-evidence)

> Catch governance holes before production does. A static governance linter for
> AI agent workspaces — and a **rule host**: an engine that walks a workspace,
> runs governance rules over it, and produces **deterministic findings**.

> **Part of [Octopus Core](https://github.com/octoryn) — the open infrastructure stack for governed AI.** One job per repo, along the agent lifecycle: [Scout](https://github.com/octoryn/octopus-scout) · [Observe](https://github.com/octoryn/octopus-observe) · [Experience](https://github.com/octoryn/octopus-experience) · [Blackboard](https://github.com/octoryn/octopus-blackboard) · [Runtime](https://github.com/octoryn/octopus-runtime) · [Replay](https://github.com/octoryn/octopus-replay) — with [Inspect](https://github.com/octoryn/octopus-inspect) governing every stage.
>
> **This repo — Inspect · Govern (every stage):** Governance lint for AI workspaces.

```
Workspace → Rules → Findings → Report (pretty / json / sarif)
```

Point Inspect at a directory of AI-agent configuration — prompts, agent and
workflow definitions, MCP manifests, decision records — and it flags the
governance holes that don't show up until something ships: a committed secret,
an untrusted variable spliced into a prompt, an auto-executing action with no
approval gate, a wildcard tool grant, a decision recorded with no evidence, a
workflow that can never complete, a dependency pinned to a mutable tag. Findings
come back sorted and deterministic, ready for a human, a JSON pipeline, or CI
code scanning.

## Boundaries

Inspect is **static and self-contained**. It reads the tree on disk and reasons
about the shape of what it finds. It **does not** execute your workspace, import
a runtime, call a network, reproduce another system's policy semantics, or
modify any file. Every built-in rule is pure: same bytes on disk → same
findings, in the same order.

That last boundary is deliberate. A check that needs to understand a specific
runtime's semantics — what a given policy engine actually permits, what a
blackboard counts as a valid handoff — does **not** belong in the built-in
rules; baking it in would fork the definition of "safe". Such checks arrive as
**plugins** contributed by the runtime that owns those semantics, so there is a
single source of truth for what safe means. The built-ins only flag the
*shape* that most often hides a hole.

It is **built on the first-party [octopus-evidence](https://github.com/octoryn/octopus-evidence)
primitive** — its only runtime dependency, and the same Evidence atom the rest of
the stack rides. That single dependency is what lets `--format evidence` turn each
finding into a tamper-evident, independently-verifiable unit: your linter's findings
are court-admissible without trusting the linter. The repo is otherwise
self-contained and takes on no third-party dependencies.

## Install & build

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run build       # emit dist/
npm run example     # run the bundled demo workspace
```

Requires Node ≥ 22. Inspect scans **JSON / JSONC / text / Markdown** files;
`.mcp.json` and `.prompt` are recognized. YAML is a documented future extension
and is **not** parsed yet (see [Boundaries](#boundaries) and
[`docs/DESIGN.md`](docs/DESIGN.md)).

## CLI

```bash
octopus-inspect [path]                 # inspect a directory or file (default ".")
octopus-inspect . --format sarif       # emit SARIF for CI code scanning
octopus-inspect . --format evidence    # emit tamper-evident Evidence per finding
octopus-inspect . --threshold warning  # fail the build on warnings too
```

| Option           | Meaning                                                        |
| ---------------- | ------------------------------------------------------------- |
| `--format <f>`   | Output format: `pretty` \| `json` \| `sarif` \| `evidence` (default `pretty`) |
| `--config <file>`| Config file to use (default `.octoinspect.json` at the root)  |
| `--threshold <s>`| Severity that fails the run: `error` \| `warning` \| `info` (default `error`) |
| `--no-color`     | Disable ANSI color in pretty output                           |
| `--version`      | Print version and exit                                        |
| `--help`         | Show help                                                     |

**Exit codes:** `0` clean · `1` findings at or above the threshold · `2`
configuration error (bad config, an unloadable plugin, a colliding rule id, or a
missing path). Pretty output is colorized only on a TTY; `--no-color` forces it
off.

## GitHub code scanning (primary path)

SARIF is the standard static-analysis exchange format, and it is Inspect's
primary distribution path: emit SARIF in CI and GitHub renders every finding
inline on the PR, in the Security tab, and as a check. Add a step to your
workflow:

```yaml
# .github/workflows/inspect.yml
name: inspect
on: [push, pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    permissions:
      security-events: write   # required to upload SARIF
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npx octopus-inspect . --format sarif > inspect.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: inspect.sarif
```

The SARIF run carries each rule's id, title, description, and default level, so
findings land already labeled and grouped. To *also* fail the job on findings,
run a second `octopus-inspect .` (pretty or json) with your chosen
`--threshold`; the upload step above never fails the build on its own.

## GitHub Action (drop-in)

A composite action wraps the SARIF path above so any repo can adopt it in two
steps: run Inspect, then upload the SARIF. The action runs the **published npm
package** via `npx` — no build, no checkout of this repo. The SARIF upload is
kept out of the action so **permissions stay in the caller's workflow** (the
`security-events: write` grant belongs to you, not to a third-party action).

```yaml
# .github/workflows/inspect.yml
name: inspect
on: [push, pull_request]

permissions:
  security-events: write # required to upload SARIF
  contents: read

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: inspect
        uses: octoryn/octopus-inspect@v0.3.1
        with:
          path: .
          fail-on-findings: "false" # report without failing the build
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: ${{ steps.inspect.outputs.sarif-file }}
```

Findings then render inline on the PR, in the **Security** tab, and as a check.
Set `fail-on-findings: "true"` (the default) to also fail the step when Inspect
exits nonzero — combine that with `args: "--threshold warning"` to choose what
severity blocks the build.

### Inputs

| Input              | Default                 | Meaning |
| ------------------ | ----------------------- | ------- |
| `path`             | `.`                     | Workspace directory or file to scan. |
| `args`             | `""`                    | Extra CLI arguments passed through to `octopus-inspect` (e.g. `--threshold warning`). |
| `version`          | `0.3.0`                 | npm version/spec of `octopus-inspect` to run (`octopus-inspect@<version>`). |
| `sarif-file`       | `octopus-inspect.sarif` | Path the SARIF report is written to. |
| `fail-on-findings` | `true`                  | When `true`, a nonzero Inspect exit (findings at/above the threshold, or a config error) fails the step; when `false`, the step always succeeds so the SARIF can still be uploaded. |

### Outputs

| Output       | Meaning |
| ------------ | ------- |
| `sarif-file` | Path to the SARIF report the action produced — feed it to `upload-sarif`. |

The CLI writes SARIF to **stdout**; the action redirects that to `sarif-file`
and captures the exit code so `fail-on-findings` can gate the step
independently of the upload.

## Programmatic API

Everything the CLI does is available as a library:

```ts
import { inspect, shouldFail, formatSarif } from "octopus-inspect";

const report = await inspect("./workspace");

for (const f of report.findings) {
  console.log(`${f.severity}\t${f.file}:${f.line ?? 0}\t${f.ruleId}\t${f.message}`);
}

console.log(report.summary);              // { error, warning, info }
console.log(shouldFail(report, "error")); // would CI fail?

const sarif = formatSarif(report);        // SARIF 2.1.0 string
```

`inspect(root, options?)` returns a deterministic `InspectReport`
(`{ root, findings, fileCount, ruleCount, summary }`); pass
`{ config, rules }` to override either. `formatPretty` and `formatJson` are the
other two reporters. The full built-in rule set is exported as `builtinRules`.

## Built-in rules

Seven static rules ship in the box. Each has a stable id and a default severity
you can override or disable in config.

| Id                          | Default   | Kind       | What it flags |
| --------------------------- | --------- | ---------- | ------------- |
| `secret-in-source`          | `error`   | text       | Hardcoded credentials — cloud keys, provider API keys, private-key blocks, generic `secret = "…"` assignments — committed to the tree. Placeholders (`your-…`, `${…}`, `process.env`) stay quiet; the matched secret is redacted in the finding. |
| `prompt-injection-sink`     | `warning` | text/json  | A prompt or instruction template that splices an untrusted variable (`{{ user_input }}`, `${userMessage}`, `%(query)s`) straight into the instructions, where it could smuggle in adversarial instructions. |
| `unsafe-autonomy`           | `error`   | structural | A config object that marks itself auto-executing (`autonomy`, `autoApprove`, `requireApproval: false`, …) next to a side-effect marker (`execute`, `command`, `tool`, …) while declaring no approval or policy field. |
| `overbroad-permission`      | `warning` | structural | A wildcard (`*`, `all`, `*:*`) in an allowlist, tool list, or scope grant — every capability allowed instead of a least-privilege set. |
| `missing-evidence`          | `warning` | structural | A record stating a `decision` / `claim` / `conclusion` that carries no `evidence` / `source` / `rationale` / `citation` field. Shape only — it does not judge whether the evidence is *good*, only that some is present. |
| `circular-workflow`         | `error`   | structural | A dependency cycle among workflow/agent steps (via `next` / `then` / `dependsOn` / `requires` / `needs` edges) parsed from JSON. A cyclic graph can never complete. |
| `unpinned-agent-dependency` | `info`    | structural | An MCP/agent launch arg (`npx pkg@latest`) or manifest dependency pinned to a mutable tag (`latest`, `*`, `next`, …), where the executed code can change without review. |

"Structural" rules read the parsed shape of JSON/JSONC objects; they never
reason about a runtime's semantics — that boundary is what keeps "safe" defined
in one place. `secret-in-source` and `prompt-injection-sink` also scan plain
text and prompt files.

## OWASP Agentic Top 10 mapping

Every built-in rule is tagged with the category it addresses in the
[OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) —
surfaced in SARIF (`properties.tags`, e.g. `OWASP-ASI-2026:ASI01`) so findings
slot into the taxonomy security teams already use.

| Rule | OWASP Agentic 2026 |
|---|---|
| `secret-in-source` | ASI03 · Identity and Privilege Abuse |
| `prompt-injection-sink` | ASI01 · Agent Goal Hijack |
| `unsafe-autonomy` | ASI02 · Tool Misuse · ASI09 · Human-Agent Trust |
| `overbroad-permission` | ASI03 · Identity and Privilege Abuse |
| `missing-evidence` | ASI09 · Human-Agent Trust Exploitation |
| `circular-workflow` | ASI08 · Cascading Failures |
| `unpinned-agent-dependency` | ASI04 · Agentic Supply Chain Vulnerabilities |

Inspect's static rules cover the subset of the Top 10 visible in committed
workspace config; runtime-only risks are out of a linter's scope by design. The
catalog is exported (`OWASP_AGENTIC_2026`, `owaspLabel`) for use in plugins.

## Configuration

Inspect looks for `.octoinspect.json` (JSONC — comments allowed) at the root,
or takes an explicit `--config <file>`. A malformed or absent config is not an
error; the run proceeds with defaults.

```jsonc
{
  // Extra ignore globs, added to the built-in defaults (node_modules, .git, dist, …).
  "ignore": ["fixtures/**", "**/*.generated.json"],

  // Per-rule overrides: "off" disables a rule; a severity re-grades it.
  "rules": {
    "unpinned-agent-dependency": "off",     // don't care in this repo
    "prompt-injection-sink": "error",       // treat as blocking here
    "missing-evidence": "info"              // downgrade to advisory
  },

  // Plugin module specifiers, resolved from the workspace root.
  "plugins": ["./inspect-plugins/runtime-policy.js"],

  // Skip files larger than this many bytes (default 1 MiB).
  "maxFileBytes": 524288
}
```

A rule set to `"off"` is not run at all. A severity override (or a plugin rule's
own default) wins over the built-in default; that effective severity is what the
threshold and the exit code compare against. See
[`.octoinspect.json`](.octoinspect.json) for a fully commented example.

## Plugins

Inspect is a **rule host**. When a check needs a specific runtime's semantics,
that runtime ships the rule as a plugin and Inspect hosts it — so the definition
of "safe" is never forked into the built-ins. A plugin is just a module that
exports a `{ name, rules }` object (as the default export, a named `plugin`, or
the module shape itself):

```ts
// inspect-plugins/runtime-policy.ts
import { definePlugin, type Rule, type Workspace } from "octopus-inspect";

const noProdWrites: Rule = {
  id: "runtime/no-prod-writes",
  title: "Agent may write to production without a policy",
  description: "Rejects a manifest that grants prod write scope with no attached policy.",
  severity: "error",
  check(workspace: Workspace) {
    // Read the shape of the workspace; return raw findings.
    return [];
  },
};

export default definePlugin({ name: "runtime-policy", rules: [noProdWrites] });
```

Reference it from config and its rules run alongside the built-ins:

```jsonc
{ "plugins": ["./inspect-plugins/runtime-policy.js"] }
```

Relative specifiers resolve against the workspace root; bare specifiers resolve
as normal node modules. Duplicate rule ids are rejected (a plugin can never
silently shadow another rule), and a plugin that fails to load is reported as a
configuration error rather than aborting the run. The `parseJsonc`, `walkJson`,
`isJsonObject`, and `findKeyLine` helpers are exported to make structural plugin
rules easy to author.

## Design

The authoritative architecture and contracts live in
[`docs/DESIGN.md`](docs/DESIGN.md) — the rule-host philosophy, the
Workspace → Rules → Findings → Report pipeline, the determinism guarantees, and
the config/plugin model. Read it before making changes; code is written against
that spec.

## License

[Apache-2.0](LICENSE) © Octoryn.
