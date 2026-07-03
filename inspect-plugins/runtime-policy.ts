/**
 * Reference semantic plugin: **runtime-policy**.
 *
 * This is the plugin octopus-inspect's design points at but does not ship: a
 * governance check that a static linter cannot do *alone*, because being correct
 * requires understanding a specific runtime's autonomy model. Rather than
 * re-encode that model here (and let it drift), the plugin imports the real
 * thing from `octopus-runtime` and derives its verdict from the runtime's own
 * ordering and routing. Inspect hosts the rule; the runtime owns the meaning of
 * "safe". If the runtime changes what a level permits, this plugin changes with
 * it, by construction.
 *
 * The single rule below, `runtime-over-autonomy`, flags a config that grants a
 * **side-effecting** tool an effective autonomy *above the safe ceiling*. The
 * ceiling is not a hard-coded string: it is computed from `octopus-runtime`'s
 * gate — the highest {@link AutonomyLevel} whose route never executes a side
 * effect without a human approval. In today's runtime that is `draft`
 * (`autonomous` is the only route that executes), but the plugin never assumes
 * this; it asks the runtime.
 *
 * Authoring surface. This file imports inspect only through its **public**
 * package entry (`octopus-inspect`) — the exact surface an external consumer
 * has — so it doubles as a copyable template. It depends on no private module.
 *
 * Loading. Inspect resolves a plugin specifier and `import()`s it, coercing the
 * module to `{ name, rules }` (default export, named `plugin`, or the module
 * shape). Under a TypeScript loader (tsx) the `.ts` loads directly; for the
 * plain-node CLI, build `inspect-plugins/dist/runtime-policy.js`
 * (`npm run build:plugins`) and point `.octoinspect.json` at that. See
 * `docs/PLUGINS.md`.
 */
import type {
  JsonObject,
  JsonValue,
  RawFinding,
  Rule,
  Workspace,
  WorkspaceFile,
} from "octopus-inspect";
import { findKeyLine, isJsonObject, parseJsonc, walkJson } from "octopus-inspect";

// The runtime's REAL autonomy semantics — the single source of truth. We use
// its ordering (autonomyRank / autonomyAtLeast) and its gate (routeFor +
// routeExecutes) so the plugin and the runtime agree by construction.
import {
  AutonomyLevel,
  autonomyAtLeast,
  autonomyRank,
  ALL_AUTONOMY_LEVELS,
  routeFor,
  routeExecutes,
} from "octopus-runtime";
import type { PolicyDecision } from "octopus-runtime";

/**
 * Every JSON/JSONC file in the workspace that parses, with its raw lines for
 * best-effort line lookup. Built only from inspect's public `Workspace` +
 * `parseJsonc`, so the plugin never reaches into a private helper.
 */
function parsedJsonFiles(
  workspace: Workspace,
): { file: WorkspaceFile; root: JsonValue; lines: readonly string[] }[] {
  const out: { file: WorkspaceFile; root: JsonValue; lines: readonly string[] }[] = [];
  for (const file of workspace.files) {
    if (file.binary) continue;
    if (file.ext !== ".json" && file.ext !== ".jsonc" && !file.path.endsWith(".json")) continue;
    const root = parseJsonc(file.text());
    if (root === undefined) continue;
    out.push({ file, root, lines: file.lines() });
  }
  return out;
}

/**
 * A minimal, well-typed {@link PolicyDecision} for probing the runtime's gate.
 * `requiresApproval: false` models the *worst case* a static config can encode —
 * no policy gate at all — with no denial and no applied constraints, so the only
 * thing driving the route is the effective autonomy we hand in.
 */
function probeDecision(level: AutonomyLevel): PolicyDecision {
  return {
    requestedAutonomy: level,
    effectiveAutonomy: level,
    requiresApproval: false,
    constraints: [],
    appliedPolicies: [],
  };
}

/**
 * The highest autonomy level a **side-effecting** tool may be granted while
 * still guaranteeing no effect executes without a human approval — derived from
 * the runtime's own gate rather than asserted.
 *
 * For each level, ask the runtime: if an action reaches this effective autonomy
 * with no policy-required approval, does its route execute a side effect? The
 * safe ceiling is the most-permissive level for which the answer is "no". If a
 * future runtime version makes another route execute, the ceiling moves with it.
 */
function safeCeilingForSideEffect(): AutonomyLevel {
  let ceiling: AutonomyLevel = AutonomyLevel.Observe;
  for (const level of ALL_AUTONOMY_LEVELS) {
    const route = routeFor(probeDecision(level));
    if (!routeExecutes(route) && autonomyAtLeast(level, ceiling)) {
      ceiling = level;
    }
  }
  return ceiling;
}

/** The ceiling, computed once from the runtime's model at load time. */
const SAFE_CEILING = safeCeilingForSideEffect();

/** Lowercase, punctuation-stripped → original key, for tolerant lookups. */
function keyIndex(obj: JsonObject): Map<string, string> {
  const map = new Map<string, string>();
  for (const k of Object.keys(obj)) map.set(k.toLowerCase().replace(/[_-]/g, ""), k);
  return map;
}

function get(
  obj: JsonObject,
  index: Map<string, string>,
  normalized: string,
): JsonValue | undefined {
  const original = index.get(normalized);
  return original === undefined ? undefined : obj[original];
}

/** Coerce a config's declared autonomy string to a real runtime level, if valid. */
function toAutonomyLevel(value: JsonValue | undefined): AutonomyLevel | undefined {
  if (typeof value !== "string") return undefined;
  const needle = value.trim().toLowerCase();
  return ALL_AUTONOMY_LEVELS.find((l) => l === needle);
}

/** The autonomy this config object declares, and the key it came from. */
function declaredAutonomy(
  obj: JsonObject,
  index: Map<string, string>,
): { level: AutonomyLevel; key: string } | undefined {
  for (const norm of ["autonomy", "autonomylevel", "level", "mode"]) {
    const key = index.get(norm);
    if (key === undefined) continue;
    const level = toAutonomyLevel(obj[key]);
    if (level !== undefined) return { level, key };
  }
  return undefined;
}

// A side-effecting tool: the config names a concrete outward action/connector,
// not merely a read. These mirror the runtime's execute-boundary vocabulary.
const SIDE_EFFECT_KEYS = [
  "execute",
  "action",
  "command",
  "cmd",
  "run",
  "sideeffect",
  "tool",
  "connector",
  "effect",
  "shell",
  "apicall",
  "writes",
  "mutation",
];

function hasSideEffect(obj: JsonObject, index: Map<string, string>): boolean {
  return SIDE_EFFECT_KEYS.some((k) => index.has(k));
}

// If a policy/approval gate is declared, the runtime would lower the effective
// autonomy anyway; this rule targets the case where the config itself grants
// over-ceiling autonomy with nothing to bring it back down.
const GUARD_KEYS = ["approval", "approvals", "policy", "policies", "guard", "gate"];

// A gate key is only a real gate when it carries a meaningful value. An
// empty string, `0`, or an empty object/array is a declared-but-empty gate —
// it does not actually bring the effective autonomy down, so it must NOT
// silence the rule (that would be a false negative on exactly the misconfig we
// care about).
function isMeaningfulGate(v: JsonValue | undefined): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true; // `true`, or any other non-empty scalar
}

function hasExplicitGate(obj: JsonObject, index: Map<string, string>): boolean {
  if (get(obj, index, "requireapproval") === true) return true;
  if (get(obj, index, "requiresapproval") === true) return true;
  for (const k of GUARD_KEYS) {
    if (isMeaningfulGate(get(obj, index, k))) return true;
  }
  return false;
}

/**
 * runtime-over-autonomy — a side-effecting tool granted autonomy above the
 * runtime's safe ceiling, with no policy/approval gate to lower it.
 *
 * OWASP: ASI02 (Tool Misuse and Exploitation) — the tool can produce an outward
 * effect with no human gate; ASI03 (Identity and Privilege Abuse) — the grant
 * hands the agent more privilege than the safe policy ceiling allows.
 */
export const runtimeOverAutonomy: Rule = {
  id: "runtime-over-autonomy",
  title: "Side-effecting tool granted autonomy above the runtime's safe ceiling",
  description:
    `Semantic rule: flags a config that grants a side-effecting tool an autonomy level ` +
    `above octopus-runtime's safe ceiling (${SAFE_CEILING}) with no policy/approval gate. ` +
    `The ceiling is derived from the runtime's own gate (routeExecutes), so inspect and the ` +
    `runtime agree on what "safe" means by construction — a check a static linter cannot do alone.`,
  severity: "error",
  owasp: ["ASI02", "ASI03"],
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        if (!isJsonObject(node.value)) return;
        const obj = node.value;
        const index = keyIndex(obj);

        const declared = declaredAutonomy(obj, index);
        if (declared === undefined) return;
        if (!hasSideEffect(obj, index)) return;
        // Compare against the runtime-derived ceiling: only a grant STRICTLY
        // above the ceiling is a finding. `autonomyAtLeast(ceiling, level)`
        // being false means `level` outranks the ceiling.
        if (autonomyAtLeast(SAFE_CEILING, declared.level)) return;
        if (hasExplicitGate(obj, index)) return;

        const line = findKeyLine(lines, declared.key);
        findings.push({
          message:
            `Side-effecting tool granted autonomy "${declared.level}" ` +
            `(rank ${autonomyRank(declared.level)}), above the runtime's safe ceiling ` +
            `"${SAFE_CEILING}" (rank ${autonomyRank(SAFE_CEILING)}) — it would execute an ` +
            `effect with no human approval`,
          file: file.path,
          ...(line !== undefined ? { line } : {}),
          excerpt: `${declared.key}: ${declared.level}`,
          suggestion:
            `Lower autonomy to "${SAFE_CEILING}" or below so the effect is drafted for approval, ` +
            `or add a policy/approval gate that brings the effective autonomy back down.`,
        });
      });
    }
    return findings;
  },
};

/** The reference semantic plugin, ready to host under inspect's loader. */
export default {
  name: "runtime-policy",
  rules: [runtimeOverAutonomy],
};
