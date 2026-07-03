/**
 * Rule: circular-workflow — a dependency cycle among workflow/agent steps.
 *
 * A workflow whose steps reference each other in a loop (A → B → A, directly or
 * transitively) can never complete and usually signals a modeling mistake. This
 * parses step collections out of JSON (arrays of `{ id, next|dependsOn|… }`
 * objects, or id-keyed maps of the same) and reports the first cycle it finds
 * per graph. Pure graph analysis — no execution.
 */
import type { JsonObject, JsonValue } from "../jsonc.js";
import type { RawFinding, Rule, Workspace } from "../types.js";
import { isJsonObject, walkJson } from "../jsonc.js";
import { parsedJsonFiles } from "./helpers.js";

const EDGE_KEYS = new Set(["next", "then", "to", "dependson", "requires", "needs", "after"]);

type Graph = Map<string, Set<string>>;

function normKey(k: string): string {
  return k.toLowerCase().replace(/[_-]/g, "");
}

/** Outgoing edge targets declared on a step object. */
function edgeTargets(step: JsonObject): string[] {
  const targets: string[] = [];
  for (const [k, v] of Object.entries(step)) {
    if (!EDGE_KEYS.has(normKey(k))) continue;
    if (typeof v === "string") targets.push(v);
    else if (Array.isArray(v))
      for (const item of v) if (typeof item === "string") targets.push(item);
  }
  return targets;
}

function stepId(step: JsonObject): string | undefined {
  const id = step["id"] ?? step["name"] ?? step["step"];
  return typeof id === "string" ? id : undefined;
}

/** Build candidate step-graphs found anywhere in a JSON document. */
function extractGraphs(root: JsonValue): Graph[] {
  const graphs: Graph[] = [];

  walkJson(root, (node) => {
    const v = node.value;

    // Array of step objects: [{ id, next }, …]
    if (Array.isArray(v)) {
      const steps = v.filter(isJsonObject).filter((s) => stepId(s) !== undefined);
      if (steps.length >= 2 && steps.some((s) => edgeTargets(s).length > 0)) {
        const g: Graph = new Map();
        for (const s of steps) g.set(stepId(s)!, new Set());
        for (const s of steps) {
          const from = stepId(s)!;
          for (const t of edgeTargets(s)) if (g.has(t)) g.get(from)!.add(t);
        }
        graphs.push(g);
      }
      return;
    }

    // Id-keyed map of steps: { a: { next: "b" }, b: { next: "a" } }
    if (isJsonObject(v)) {
      const entries = Object.entries(v).filter(
        (e): e is [string, JsonObject] => isJsonObject(e[1]) && edgeTargets(e[1]).length > 0,
      );
      if (entries.length >= 2) {
        const ids = new Set(Object.keys(v).filter((k) => isJsonObject(v[k])));
        const g: Graph = new Map();
        for (const id of ids) g.set(id, new Set());
        for (const [id, step] of entries) {
          for (const t of edgeTargets(step)) if (g.has(t)) g.get(id)!.add(t);
        }
        graphs.push(g);
      }
    }
  });

  return graphs;
}

/** Return the first cycle (as an ordered id list) in the graph, if any. */
function findCycle(graph: Graph): string[] | undefined {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) color.set(id, WHITE);

  // Iterative DFS (explicit stack) so a long acyclic chain of steps cannot
  // overflow the call stack and abort the whole scan. Neighbors are sorted for
  // a deterministic cycle across runs.
  for (const root of [...graph.keys()].sort()) {
    if (color.get(root) !== WHITE) continue;
    const path: string[] = [root];
    const frames: { node: string; neighbors: string[]; i: number }[] = [
      { node: root, neighbors: [...(graph.get(root) ?? [])].sort(), i: 0 },
    ];
    color.set(root, GRAY);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      if (frame.i >= frame.neighbors.length) {
        color.set(frame.node, BLACK);
        frames.pop();
        path.pop();
        continue;
      }
      const next = frame.neighbors[frame.i++]!;
      const c = color.get(next);
      if (c === GRAY) {
        const start = path.indexOf(next);
        return [...path.slice(start), next];
      }
      if (c === WHITE) {
        color.set(next, GRAY);
        path.push(next);
        frames.push({ node: next, neighbors: [...(graph.get(next) ?? [])].sort(), i: 0 });
      }
    }
  }
  return undefined;
}

function valueLine(lines: readonly string[], id: string): number | undefined {
  const needle = `"${id}"`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return undefined;
}

export const circularWorkflow: Rule = {
  id: "circular-workflow",
  title: "Dependency cycle in a workflow/agent graph",
  description:
    "Detects cycles among workflow or agent steps (via next/then/dependsOn/requires/needs edges) parsed from JSON. A cyclic graph can never complete.",
  severity: "error",
  owasp: ["ASI08"],
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      const seen = new Set<string>();
      for (const graph of extractGraphs(root)) {
        const cycle = findCycle(graph);
        if (!cycle) continue;
        const signature = [...cycle].sort().join(",");
        if (seen.has(signature)) continue;
        seen.add(signature);
        const first = cycle[0];
        const line = first !== undefined ? valueLine(lines, first) : undefined;
        findings.push({
          message: `Workflow dependency cycle: ${cycle.join(" → ")}`,
          file: file.path,
          ...(line !== undefined ? { line } : {}),
          excerpt: cycle.join(" → "),
          suggestion: "Break the cycle — remove or reverse one edge so the step graph is acyclic.",
        });
      }
    }
    return findings;
  },
};
