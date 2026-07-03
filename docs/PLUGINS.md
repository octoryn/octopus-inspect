# Writing a semantic plugin (reference: `runtime-policy`)

Inspect is a **rule host**. Its built-in rules are all *static and
self-contained*: they read the shape of committed config and never import a
runtime or reproduce another system's meaning of "safe". That is deliberate —
duplicating a runtime's policy model in a linter forks the definition of safe and
lets the two drift.

Some checks, though, are only *correct* if they understand a specific runtime's
semantics. Those arrive as **plugins**, contributed by the runtime that owns the
meaning. Inspect hosts them; the runtime remains the single source of truth.

This note walks the reference plugin that proves the thesis:
[`inspect-plugins/runtime-policy.ts`](../inspect-plugins/runtime-policy.ts).

## What it checks (and why a static linter can't do it alone)

The built-in `unsafe-autonomy` rule flags an obviously dangerous *shape* — an
`autonomy: "autonomous"` next to an `execute:` marker with no gate. It works off
string patterns and knows nothing about what any level actually permits.

The plugin's `runtime-over-autonomy` rule goes further. It flags a side-effecting
tool granted autonomy **above the runtime's safe ceiling** — and it computes that
ceiling from `octopus-runtime`'s *own* gate, not a hard-coded list:

```ts
// The safe ceiling is the most-permissive level whose route never executes a
// side effect, even with no policy approval. Ask the runtime, don't assume.
function safeCeilingForSideEffect(): AutonomyLevel {
  let ceiling: AutonomyLevel = AutonomyLevel.Observe;
  for (const level of ALL_AUTONOMY_LEVELS) {
    const route = routeFor(probeDecision(level)); // runtime's gate
    if (!routeExecutes(route) && autonomyAtLeast(level, ceiling)) ceiling = level;
  }
  return ceiling;
}
```

In today's runtime the ceiling resolves to `draft` (only `autonomous` executes),
but the plugin never states that. If a future runtime version makes another route
execute, `routeExecutes` changes and the ceiling moves with it — **the plugin and
the runtime agree by construction**. That is the property a static linter cannot
have on its own: it would have to copy the runtime's routing table and hope it
stays in sync.

Findings map to the shared taxonomy via the `owasp` field:

- **ASI02 — Tool Misuse and Exploitation:** the tool can produce an outward
  effect with no human gate.
- **ASI03 — Identity and Privilege Abuse:** the grant hands the agent more
  privilege than the safe policy ceiling allows.

## The anatomy of a plugin

A plugin is any module that exports a `{ name, rules }` `Plugin` — as the default
export, a named `plugin`, or the module shape itself. Each rule is a `Rule`
(`id`, `title`, `description`, `severity`, optional `owasp`, and a `check`):

```ts
import type { Rule, Workspace } from "octopus-inspect";
import { parseJsonc, walkJson, isJsonObject, findKeyLine } from "octopus-inspect";
import { AutonomyLevel, routeFor, routeExecutes /* … */ } from "octopus-runtime";

export const runtimeOverAutonomy: Rule = {
  id: "runtime-over-autonomy",
  title: "Side-effecting tool granted autonomy above the runtime's safe ceiling",
  description: "…",
  severity: "error",
  owasp: ["ASI02", "ASI03"],
  check(workspace: Workspace) {
    /* return RawFinding[] — the engine attaches ruleId and resolves severity */
    return [];
  },
};

export default { name: "runtime-policy", rules: [runtimeOverAutonomy] };
```

The reference plugin imports inspect **only through its public package entry**
(`octopus-inspect`) — the exact surface an external consumer has — so it doubles
as a copyable template and never reaches into a private module. `octopus-runtime`
is a **devDependency** of this repo, present because the plugin is a loadable
example; it is deliberately *not* in inspect's shipped `dependencies`, so the core
package stays runtime-free.

## Opting in (as a consumer)

The repo's own self-scan stays decoupled and dependency-free: the plugin is
**not** enabled in the repo-root `.octoinspect.json`. A consumer opts in by
adding the specifier to *their* config:

```jsonc
// .octoinspect.json
{
  "plugins": ["./inspect-plugins/runtime-policy.js"]
}
```

Relative specifiers resolve against the workspace root; bare specifiers resolve as
normal node modules. Duplicate rule ids are rejected, and a plugin that fails to
load is reported as a configuration error (exit 2) rather than aborting the run.

### `.ts` vs `.js`

Inspect resolves the specifier and `import()`s it. Under a TypeScript loader
(`tsx`, how the tests run) a `.ts` plugin loads directly. The production CLI runs
on plain node, which cannot import `.ts`, so build the plugin first:

```sh
npm run build:plugins   # emits inspect-plugins/dist/runtime-policy.js
```

and point config at the built file (`"./inspect-plugins/dist/runtime-policy.js"`).
Because the plugin imports only `octopus-inspect` and `octopus-runtime` (both
node-resolvable), the built `.js` loads under plain node with no path rewriting.

## Testing a plugin

Load it **through the real loader and engine**, not by calling the rule directly —
that is what proves it composes with the host. See
[`tests/runtime-policy-plugin.test.ts`](../tests/runtime-policy-plugin.test.ts),
which asserts the plugin (a) loads without error, (b) fires exactly once on an
over-autonomy fixture, (c) is silent on a safe fixture (ceiling-bound, read-only,
and policy-gated cases), (d) merges with the built-ins with no duplicate-id
rejection, and (e) reports the ceiling the runtime's gate actually yields.

## Trust

A plugin runs with the inspecting process's privileges. Configure only plugins you
trust — treat `plugins` like any other code dependency (see
[`SECURITY.md`](../SECURITY.md)).
