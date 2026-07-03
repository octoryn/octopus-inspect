/**
 * Rule: overbroad-permission — a wildcard grant of tools/permissions/scopes.
 *
 * `"*"` in an allowlist, tool list, or scope grant hands an agent every
 * capability, which is rarely intended and defeats least-privilege. Structural
 * and static: it only inspects the declared shape of a permission field.
 */
import type { RawFinding, Rule, Workspace } from "../types.js";
import { walkJson } from "../jsonc.js";
import { findKeyLine, keyMatches, parsedJsonFiles } from "./helpers.js";

const PERMISSION_KEY_FRAGMENTS = ["permission", "allow", "scope", "tool", "capabilit", "grant"];

const WILDCARDS = new Set(["*", "**", "all", ".*", "*:*", "*/*"]);

function isWildcard(value: string): boolean {
  return WILDCARDS.has(value.trim().toLowerCase());
}

export const overbroadPermission: Rule = {
  id: "overbroad-permission",
  title: "Wildcard permission or tool grant",
  description:
    "Flags allowlists, tool lists, and scope grants set to a wildcard (`*`, `all`), which grant every capability instead of an explicit least-privilege set.",
  severity: "warning",
  owasp: ["ASI03"],
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        if (!keyMatches(node.key, ...PERMISSION_KEY_FRAGMENTS)) return;
        const v = node.value;
        let hit = false;
        if (typeof v === "string") {
          hit = isWildcard(v);
        } else if (Array.isArray(v)) {
          hit = v.some((item) => typeof item === "string" && isWildcard(item));
        }
        if (!hit) return;
        const key = typeof node.key === "string" ? node.key : String(node.key);
        const line = findKeyLine(lines, key);
        findings.push({
          message: `Wildcard grant in "${key}" — every capability is allowed`,
          file: file.path,
          ...(line !== undefined ? { line } : {}),
          excerpt: key,
          suggestion:
            "Replace the wildcard with an explicit, minimal list of the capabilities actually needed.",
        });
      });
    }
    return findings;
  },
};
