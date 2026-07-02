/** The inspection engine: build a workspace, run rules, aggregate findings. */
import type { Finding, InspectConfig, InspectReport, Rule, Severity, Workspace } from "./types.js";
import { buildWorkspace } from "./workspace.js";
import { isRuleEnabled, resolveSeverity } from "./config.js";
import { builtinRules } from "./rules/index.js";

export interface InspectOptions {
  /** Configuration (severity overrides, ignores, …). Defaults to `{}`. */
  readonly config?: InspectConfig;
  /** Rules to run. Defaults to the built-in rule set. */
  readonly rules?: readonly Rule[];
}

/**
 * Inspect a workspace directory (or single file) and return a deterministic
 * report. Same inputs on disk → identical findings in identical order.
 */
export async function inspect(root: string, options: InspectOptions = {}): Promise<InspectReport> {
  const config = options.config ?? {};
  const rules = (options.rules ?? builtinRules).filter((r) => isRuleEnabled(r.id, config));

  const workspaceOptions: { ignore?: readonly string[]; maxFileBytes?: number } = {};
  if (config.ignore !== undefined) workspaceOptions.ignore = config.ignore;
  if (config.maxFileBytes !== undefined) workspaceOptions.maxFileBytes = config.maxFileBytes;
  const workspace: Workspace = buildWorkspace(root, workspaceOptions);

  const findings: Finding[] = [];
  for (const rule of rules) {
    // Isolate each rule: a rule that throws surfaces as a visible error finding
    // rather than aborting the whole scan (and taking every other rule with it).
    let raw: Awaited<ReturnType<Rule["check"]>>;
    try {
      raw = await rule.check(workspace);
    } catch (cause) {
      // Null-safe: a rule may throw a non-Error (even null/undefined); the catch
      // must never itself throw, or it defeats the isolation.
      const message = cause instanceof Error ? cause.message : String(cause);
      findings.push({
        ruleId: rule.id,
        severity: "error",
        message: `rule "${rule.id}" failed: ${message}`,
        file: workspace.root,
      });
      continue;
    }
    for (const rf of raw) {
      const finding: Finding = {
        ruleId: rule.id,
        severity: resolveSeverity(rule.id, rule.severity, rf.severity, config),
        message: rf.message,
        file: rf.file,
        ...(rf.line !== undefined ? { line: rf.line } : {}),
        ...(rf.column !== undefined ? { column: rf.column } : {}),
        ...(rf.excerpt !== undefined ? { excerpt: rf.excerpt } : {}),
        ...(rf.suggestion !== undefined ? { suggestion: rf.suggestion } : {}),
      };
      findings.push(finding);
    }
  }

  findings.sort(compareFindings);

  const summary: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) summary[f.severity]++;

  return {
    root: workspace.root,
    findings,
    fileCount: workspace.files.length,
    ruleCount: rules.length,
    summary,
  };
}

/** Stable ordering: file, then line, then column, then rule, then message. */
function compareFindings(a: Finding, b: Finding): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  const al = a.line ?? Number.MAX_SAFE_INTEGER;
  const bl = b.line ?? Number.MAX_SAFE_INTEGER;
  if (al !== bl) return al - bl;
  const ac = a.column ?? Number.MAX_SAFE_INTEGER;
  const bc = b.column ?? Number.MAX_SAFE_INTEGER;
  if (ac !== bc) return ac - bc;
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

/**
 * Does this report warrant a non-zero exit? True if any finding is at or above
 * the threshold severity (default `error`).
 */
export function shouldFail(report: InspectReport, threshold: Severity = "error"): boolean {
  const rank: Record<Severity, number> = { info: 0, warning: 1, error: 2 };
  return report.findings.some((f) => rank[f.severity] >= rank[threshold]);
}
