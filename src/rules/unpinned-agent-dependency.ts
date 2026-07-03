/**
 * Rule: unpinned-agent-dependency — an agent/MCP dependency on a mutable tag.
 *
 * An MCP server launched as `npx pkg@latest`, or a manifest dependency pinned to
 * `latest`/`*`, means the code an agent runs can change under you with no review
 * — a supply-chain drift risk that matters more when the dependency wields
 * tools. Static and structural; severity `info` (hygiene, not an emergency).
 */
import type { JsonObject } from "../jsonc.js";
import type { RawFinding, Rule, Workspace } from "../types.js";
import { isJsonObject, walkJson } from "../jsonc.js";
import { findKeyLine, parsedJsonFiles } from "./helpers.js";

const MUTABLE_TAG = /@(latest|next|beta|canary|edge|nightly)\b/i;
const MUTABLE_RANGE = new Set(["latest", "*", "x", "next", "canary", "beta"]);

const DEP_FIELDS = new Set([
  "dependencies",
  "devdependencies",
  "peerdependencies",
  "optionaldependencies",
]);

function normKey(k: string): string {
  return k.toLowerCase().replace(/[_-]/g, "");
}

export const unpinnedAgentDependency: Rule = {
  id: "unpinned-agent-dependency",
  title: "Agent/MCP dependency on a mutable version tag",
  description:
    "Flags MCP/agent launch args using a mutable tag (`pkg@latest`) and manifest dependencies pinned to `latest`/`*`, where the executed code can change without review.",
  severity: "info",
  owasp: ["ASI04"],
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        // Launch args: ["npx", "some-mcp@latest"]
        if (
          typeof node.key === "string" &&
          normKey(node.key) === "args" &&
          Array.isArray(node.value)
        ) {
          for (const item of node.value) {
            if (typeof item === "string" && MUTABLE_TAG.test(item)) {
              const line = findKeyLine(lines, "args");
              findings.push(dep(file.path, `Launch arg "${item}" uses a mutable tag`, item, line));
            }
          }
          return;
        }
        // Manifest dependency maps.
        if (
          typeof node.key === "string" &&
          DEP_FIELDS.has(normKey(node.key)) &&
          isJsonObject(node.value)
        ) {
          const deps: JsonObject = node.value;
          for (const [name, range] of Object.entries(deps)) {
            if (typeof range !== "string") continue;
            if (MUTABLE_RANGE.has(range.trim().toLowerCase())) {
              const line = findKeyLine(lines, name);
              findings.push(
                dep(file.path, `Dependency "${name}" pinned to "${range}"`, name, line),
              );
            }
          }
        }
      });
    }
    return findings;
  },
};

function dep(file: string, message: string, excerpt: string, line: number | undefined): RawFinding {
  return {
    message,
    file,
    ...(line !== undefined ? { line } : {}),
    excerpt,
    suggestion:
      "Pin to an exact version (and ideally a lockfile/digest) so the code an agent runs is reviewable.",
  };
}
