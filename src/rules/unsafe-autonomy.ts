/**
 * Rule: unsafe-autonomy — a side-effecting action declared auto-executing with
 * no approval or policy gate.
 *
 * This is a *structural* check. It reads the shape of a config object — an
 * autonomy/auto-approve marker next to a side-effect marker, with no approval
 * or policy field — and never reasons about a specific runtime's semantics.
 * Deep, semantic autonomy analysis (what a given policy engine actually permits)
 * belongs in a plugin contributed by that runtime, so there is one source of
 * truth for "safe". Here we only flag the shape that most often hides a hole.
 */
import type { RawFinding, Rule, Workspace } from "../types.js";
import type { JsonObject, JsonValue } from "../jsonc.js";
import { isJsonObject, walkJson } from "../jsonc.js";
import { findKeyLine, parsedJsonFiles } from "./helpers.js";

/** Lowercase → original key map for case-insensitive lookups. */
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

/** Does the object declare dangerous autonomy? Returns the offending key. */
function dangerousAutonomyKey(obj: JsonObject, index: Map<string, string>): string | undefined {
  const autonomy = get(obj, index, "autonomy");
  if (typeof autonomy === "string" && /^(autonomous|auto)$/i.test(autonomy)) {
    return index.get("autonomy");
  }
  const mode = get(obj, index, "mode");
  if (typeof mode === "string" && /^(autonomous|auto)$/i.test(mode)) return index.get("mode");
  if (get(obj, index, "autoapprove") === true) return index.get("autoapprove");
  if (get(obj, index, "autoexecute") === true) return index.get("autoexecute");
  if (get(obj, index, "requireapproval") === false) return index.get("requireapproval");
  if (get(obj, index, "requiresapproval") === false) return index.get("requiresapproval");
  if (get(obj, index, "humanintheloop") === false) return index.get("humanintheloop");
  if (get(obj, index, "hitl") === false) return index.get("hitl");
  return undefined;
}

const SIDE_EFFECT_KEYS = [
  "execute",
  "action",
  "command",
  "cmd",
  "run",
  "sideeffect",
  "writes",
  "mutation",
  "tool",
  "connector",
  "effect",
  "shell",
  "apicall",
];

function hasSideEffect(obj: JsonObject, index: Map<string, string>): boolean {
  return SIDE_EFFECT_KEYS.some((k) => index.has(k));
}

const GUARD_KEYS = ["approval", "approvals", "policy", "policies", "guard", "gate"];

function hasGuard(obj: JsonObject, index: Map<string, string>): boolean {
  if (get(obj, index, "requireapproval") === true) return true;
  if (get(obj, index, "requiresapproval") === true) return true;
  for (const k of GUARD_KEYS) {
    const v = get(obj, index, k);
    if (v !== undefined && v !== null && v !== false) return true;
  }
  return false;
}

export const unsafeAutonomy: Rule = {
  id: "unsafe-autonomy",
  title: "Auto-executing action with no approval or policy gate",
  description:
    "Structurally flags a config object that both marks itself auto-executing (autonomy/autoApprove/requireApproval:false) and has a side-effect marker (execute/command/tool/…) while declaring no approval or policy field.",
  severity: "error",
  owasp: ["ASI02", "ASI09"],
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        if (!isJsonObject(node.value)) return;
        const obj = node.value;
        const index = keyIndex(obj);
        const dangerKey = dangerousAutonomyKey(obj, index);
        if (dangerKey === undefined) return;
        if (!hasSideEffect(obj, index)) return;
        if (hasGuard(obj, index)) return;
        const line = findKeyLine(lines, dangerKey);
        findings.push({
          message: `Auto-executing action "${dangerKey}" declares no approval or policy gate`,
          file: file.path,
          ...(line !== undefined ? { line } : {}),
          excerpt: dangerKey,
          suggestion:
            "Add an approval/policy gate, or lower the autonomy so the effect is drafted for review.",
        });
      });
    }
    return findings;
  },
};
