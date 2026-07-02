**English** | [简体中文](DESIGN.zh-CN.md)

# Inspect — Architecture & Contracts

Status: **v0.1** · Owner: Inspect · Last updated: 2026-07-03

This is the authoritative design document. Code is written *against* this spec.
When the two disagree, this document is wrong until updated — fix it here first,
then change the code.

---

## 1. What Inspect is

**Inspect catches governance holes before production does.** It is a static
governance linter for AI agent workspaces, and structurally it is a **rule
host**: an engine that walks a workspace and runs governance rules over it,
producing deterministic findings.

```
Workspace → Rules → Findings → Report (pretty / json / sarif)
```

You point Inspect at a directory of AI-agent configuration — prompts, agent and
workflow definitions, MCP manifests, decision records — and it reports the
governance holes that don't surface until something ships. It reads the tree on
disk; it reasons about the *shape* of what it finds; it returns a sorted,
deterministic report.

### 1.1 What it is *not* (enforced boundaries)

Inspect does not, and must never:

- **Execute** the workspace, import a runtime, or cause any side effect (the sole
  exception is loading configured **plugins** — see §8).
- **Reach the network.** Scanning performs no outbound I/O.
- **Follow symlinks.** The walker skips them to avoid loops and escapes.
- **Modify anything.** Inspection is read-only; it never writes to the tree.
- **Reproduce another runtime's semantics.** A built-in rule never encodes what a
  specific policy engine permits. Doing so would fork the definition of "safe"
  (see §3).

If a proposed feature requires any of the above, it does not belong in the
built-in rule set.

### 1.2 Independence

Zero dependency on any other Octopus package — and, in fact, **zero runtime
dependencies at all**. The package builds, tests, and runs end-to-end with
nothing else present. The boundary is the `Rule` / `Plugin` contract, not any
runtime SDK.

---

## 2. The pipeline

Each stage is a one-way boundary. Data flows forward only.

```
directory on disk
   │  buildWorkspace()        ── walk, ignore-filter, size-cap, binary-detect, sort
   ▼
Workspace  { root, files[], filesByExt() }
   │  for each enabled Rule: rule.check(workspace) → RawFinding[]
   ▼
RawFinding[]               ── message, file, line?, column?, excerpt?, suggestion?
   │  engine attaches ruleId, resolves effective severity, sorts
   ▼
InspectReport  { root, findings[], fileCount, ruleCount, summary }
   │  formatPretty | formatJson | formatSarif
   ▼
Report string
```

1. **Workspace.** `buildWorkspace(root, { ignore, maxFileBytes })` reads the tree
   into an immutable `Workspace`. It applies the built-in `DEFAULT_IGNORES`
   (`node_modules`, `.git`, `dist`, lockfiles, `*.min.js`, …) plus any config
   `ignore` globs, skips files over `maxFileBytes` (default 1 MiB), skips
   symlinks, flags binary files, and sorts files by POSIX-relative path. A single
   file target becomes a one-file workspace. Each `WorkspaceFile` reads and caches
   its `text()` and `lines()` lazily.

2. **Rules.** The engine runs every *enabled* rule's `check(workspace)`, which
   returns `RawFinding[]`. A rule describes only *where* and *what* — it never
   sets its own `ruleId`, and only rarely overrides its `severity`.

3. **Findings.** The engine wraps each `RawFinding` into a `Finding`, attaching
   the rule's `id` and resolving the **effective severity** (config override →
   finding's own severity → rule default), then sorts all findings by
   `file → line → column → ruleId → message`.

4. **Report.** `InspectReport` carries the sorted findings, the scanned
   `fileCount`, the run `ruleCount`, and a per-severity `summary`. Three reporters
   render it: `pretty`, `json`, `sarif`.

---

## 3. The rule-host philosophy

This is the load-bearing idea, and the reason for the sharpest boundary.

A governance check comes in two flavors:

- **Structural / static** — answerable from the *shape* of the workspace alone.
  "This object marks itself auto-executing and has a side-effect key but no
  approval field." "This allowlist contains `*`." "These steps form a cycle."
  Nothing about a specific runtime is needed to see the hole.
- **Semantic** — answerable only by knowing a specific runtime's rules. "Does
  *this* policy engine actually permit *this* action?" "Is *this* handoff valid
  under *this* blackboard's protocol?" You cannot answer these without
  reimplementing that runtime's decision logic.

**Built-in rules are exclusively the first flavor.** If Inspect baked semantic
checks in, it would become a second, drifting copy of every runtime's policy
model — and the moment that copy disagreed with the real runtime, "safe" would
mean two different things. So the built-ins deliberately stop at *structure*:
they flag the shape that most often hides a hole and leave the semantic verdict
to whoever owns the semantics.

Semantic checks arrive as **plugins**, contributed by the runtime that owns the
model. That runtime is the single source of truth for what it permits; it ships
that truth as rules, and Inspect *hosts* them. This keeps one definition of
"safe" per runtime, authored where the knowledge lives.

`unsafe-autonomy` is the canonical illustration: it flags the *structural*
tell — an auto-execute marker next to a side-effect marker with no guard field —
and explicitly does **not** try to decide whether a given autonomy setting is
acceptable under some runtime's policy. That verdict is a plugin's job.

---

## 4. Core contracts

Defined in `src/types.ts`.

- **`Rule`** — `{ id, title, description, severity, check(workspace) }`. `id` is
  a stable, kebab-case, globally-unique public identifier (it is a config key and
  a SARIF rule id; renaming it is breaking). `check` returns `RawFinding[]` (or a
  promise of them) and must be **pure and deterministic**.
- **`RawFinding`** — what a rule returns: `message`, `file`, optional `line`,
  `column`, `excerpt`, `suggestion`, and a rare per-finding `severity`. No
  `ruleId` — the engine attaches it.
- **`Finding`** — a `RawFinding` after the engine has attached `ruleId` and
  resolved the effective `severity`.
- **`Workspace` / `WorkspaceFile`** — the scanned file set. `files` is sorted and
  stable; `filesByExt(...)` filters non-binary files by extension; each file
  exposes cached `text()` / `lines()` and a POSIX-relative `path`.
- **`Plugin`** — `{ name, rules }`. A bundle of extra rules, typically
  contributed by a runtime that understands them.
- **`InspectConfig`** — `{ ignore?, rules?, plugins?, maxFileBytes? }`.
- **`InspectReport`** — `{ root, findings, fileCount, ruleCount, summary }`.

---

## 5. Built-in rules

Seven rules ship in the box, all static and self-contained.

| Id                          | Default   | Kind       | Reads |
| --------------------------- | --------- | ---------- | ----- |
| `secret-in-source`          | `error`   | text       | Every non-binary file, line by line |
| `prompt-injection-sink`     | `warning` | text/json  | `.prompt` files, `prompts/` text/markdown, and prompt/system/instruction JSON string fields |
| `unsafe-autonomy`           | `error`   | structural | Parsed JSON objects |
| `overbroad-permission`      | `warning` | structural | Parsed JSON permission/tool/scope fields |
| `missing-evidence`          | `warning` | structural | Parsed JSON records with a claim field |
| `circular-workflow`         | `error`   | structural | Parsed JSON step graphs (arrays or id-keyed maps) |
| `unpinned-agent-dependency` | `info`    | structural | Parsed JSON launch args and dependency maps |

- `secret-in-source` matches known credential shapes (AWS/Google keys, Anthropic
  and OpenAI API keys, GitHub/Slack tokens, private-key blocks) and generic
  `secret = "…"` assignments, filtering obvious placeholders. The matched secret
  is **redacted** in the finding; the report never echoes a full credential.
- `prompt-injection-sink` flags an untrusted variable (`user`, `input`, `query`,
  `message`, `content`, …) interpolated via `{{ }}`, `${ }`, or `%( )s` directly
  into instructions. It is a heuristic: the point is to make every such splice a
  reviewed decision.
- `unsafe-autonomy`, `overbroad-permission`, `missing-evidence`,
  `circular-workflow`, and `unpinned-agent-dependency` all operate on parsed
  JSON/JSONC shape only, using the shared `parsedJsonFiles` / `walkJson` /
  `findKeyLine` helpers. A file that fails to parse as JSON is skipped by the
  structural rules (text rules still see it).

Rule modules live under `src/rules/`; the ordered set is `builtinRules` in
`src/rules/index.ts`.

---

## 6. Determinism guarantees

Determinism is a hard contract, not an aspiration. Same bytes on disk → identical
findings in identical order, on any machine.

- **Stable file order.** `buildWorkspace` sorts files by POSIX-relative path, so
  rules never see filesystem iteration order.
- **Pure rules.** A `check` may only read the workspace. No wall-clock, no
  randomness, no environment. Where a rule has an internal choice (e.g.
  `circular-workflow` picks *a* cycle to report), it sorts its roots first so the
  choice is reproducible.
- **Total finding order.** The engine sorts all findings by
  `file → line → column → ruleId → message` — a total order, so ties never depend
  on rule execution order.
- **Stable rendering.** Each reporter is a pure function of the report. `sarif`
  emits only the rules that actually fired, in report order.

`shouldFail(report, threshold)` is likewise pure: it returns `true` iff any
finding is at or above the threshold severity (`error` by default), using the
rank `error > warning > info`.

---

## 7. Configuration model

`.octoinspect.json` (JSONC — comments allowed) at the workspace root, or an
explicit `--config <file>`. Loaded and normalized by `src/config.ts`.

- **Advisory, never a hard gate.** A malformed or absent default config yields an
  empty config and the run proceeds with defaults — you can always inspect. (An
  explicit `--config` that fails to parse *is* a configuration error, exit 2,
  because the operator asked for that file specifically.)
- **`ignore`** — extra globs, *added* to `DEFAULT_IGNORES` (never replacing
  them). Supports `*` and `**`.
- **`rules`** — a map of rule id → setting. `"off"` disables the rule (it is not
  run at all); a severity (`"error"` / `"warning"` / `"info"`) re-grades it.
  Unlisted rules keep their default. Unknown settings are dropped during
  normalization.
- **`plugins`** — module specifiers to load (see §8).
- **`maxFileBytes`** — skip files larger than this (default 1 MiB).

**Severity resolution** (`resolveSeverity`): config override wins, else the
finding's own severity, else the rule default. That effective severity is what
the threshold and exit code compare against.

---

## 8. Plugin model

`src/plugin.ts`. Inspect is a rule *host*; plugins are how semantic checks reach
it (§3).

- **Shape.** A plugin module exports a `Plugin` (`{ name, rules }`) as its
  default export, a named `plugin` export, or the module shape itself. `rules`
  must be an array of valid `Rule`s (each with a string `id` and a `check`
  function); a module that doesn't satisfy this is reported, not loaded.
- **Resolution.** Relative or absolute specifiers resolve against the workspace
  root; bare specifiers resolve as normal node modules.
- **Merging.** `mergeRules` concatenates built-in and plugin rules into one
  registry and **rejects duplicate ids** — a plugin can never silently shadow (or
  be shadowed by) another rule.
- **Failure is isolated.** A plugin that fails to import, doesn't export a valid
  plugin, or collides on a rule id is collected into the run's configuration
  errors (exit 2) rather than aborting the whole inspection.
- **Trust.** A plugin executes with the process's privileges. Configure only
  plugins you trust; treat `plugins` like any other code dependency (see
  `SECURITY.md`).

`definePlugin(plugin)` is an identity helper for type-checked authoring. The
exported JSON helpers (`parseJsonc`, `walkJson`, `isJsonObject`, `findKeyLine`)
make structural plugin rules easy to write against the same primitives the
built-ins use.

---

## 9. Reporters & exit codes

Three reporters, all pure functions of `InspectReport`:

- **`pretty`** — human-readable, grouped for a terminal. Colorized only on a TTY;
  `--no-color` forces it off.
- **`json`** — the machine-readable report, for pipelines and custom tooling.
- **`sarif`** — SARIF 2.1.0, the standard static-analysis exchange format and
  Inspect's **primary distribution path**. Emitting it in CI lets GitHub code
  scanning (and any SARIF-aware tool) render every finding inline. The SARIF run
  carries each fired rule's id, title, description, and default level; the `info`
  severity maps to the SARIF `note` level.

**CLI exit codes:** `0` clean · `1` findings at or above `--threshold` · `2`
configuration error (bad explicit config, an unloadable/colliding plugin, or a
missing path). The SARIF upload step in CI never fails the build on its own —
gate the build with a separate threshold run if you want that.

---

## 10. File scope & the YAML boundary

Inspect scans **JSON / JSONC / text / Markdown**. `.mcp.json` (and any
`.json`-suffixed file) is parsed as JSON; `.prompt` files and text/markdown under
`prompts/` are scanned as prompt text. Binary files are detected and skipped by
rules.

**YAML is not parsed yet.** Many agent manifests are YAML, and structural YAML
support is a planned extension — but shipping a half-working parser would be
worse than being honest about the gap. Until it lands, the structural rules only
see JSON/JSONC. This is a stated limitation, not an oversight.

---

## 11. Module layout (`src/`)

| Module            | Responsibility |
| ----------------- | -------------- |
| `types.ts`        | Core contracts: `Rule`, `RawFinding`, `Finding`, `Workspace`, `Plugin`, `InspectConfig`, `InspectReport`. |
| `engine.ts`       | `inspect()` (build → run → aggregate → sort) and `shouldFail()`. |
| `workspace.ts`    | `buildWorkspace()`, `DEFAULT_IGNORES`, the tree walker. |
| `config.ts`       | `loadConfig`, `normalizeConfig`, `isRuleEnabled`, `resolveSeverity`. |
| `plugin.ts`       | `definePlugin`, `loadPlugins`, `mergeRules`. |
| `rules/`          | The seven built-in rules + shared `helpers.ts`. |
| `report/`         | `formatPretty`, `formatJson`, `formatSarif`. |
| `jsonc.ts`        | JSONC parsing and JSON walking (`parseJsonc`, `walkJson`, `isJsonObject`, `findKeyLine`). |
| `util.ts`         | `redact`, glob matching, path/line helpers. |
| `cli.ts`          | Arg parsing, config/plugin loading, dispatch, exit codes. |

---

## 12. Deliberate limitations

- **Heuristic, not a proof.** The built-ins flag common shapes of a hole. A clean
  run is not a safety proof; a finding is not proof of exploitability. Inspect is
  one gate.
- **Structure over semantics for the built-ins** — by design (§3). Deep semantic
  verdicts are a plugin's job.
- **No YAML yet** (§10).
- **JSON parse failures are silent to structural rules** — a malformed JSON file
  is skipped rather than reported as a parse error, so a genuinely broken
  manifest won't itself produce a finding (text rules still scan it).
