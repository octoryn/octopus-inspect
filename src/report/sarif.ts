/**
 * SARIF 2.1.0 reporter.
 *
 * SARIF is the standard static-analysis exchange format; emitting it lets a CI
 * upload octopus-inspect findings straight into GitHub code scanning (and any
 * other SARIF-aware tool), which is the linter's primary distribution path.
 */
import type { Finding, InspectReport, Rule, Severity } from "../types.js";
import { builtinRules } from "../rules/index.js";

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  error: "error",
  warning: "warning",
  info: "note",
};

export interface SarifOptions {
  /** Rule metadata for the tool driver. Defaults to the built-in rules. */
  readonly rules?: readonly Rule[];
  /** Tool version string (e.g. from package.json). */
  readonly version?: string;
}

/** Render a report as a SARIF 2.1.0 log (pretty-printed JSON string). */
export function formatSarif(report: InspectReport, options: SarifOptions = {}): string {
  const rules = options.rules ?? builtinRules;
  const ruleIds = new Set(report.findings.map((f) => f.ruleId));

  const driverRules = rules
    .filter((r) => ruleIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.id,
      shortDescription: { text: r.title },
      fullDescription: { text: r.description },
      defaultConfiguration: { level: SARIF_LEVEL[r.severity] },
    }));

  const log = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "octopus-inspect",
            informationUri: "https://github.com/octoryn/octopus-inspect",
            ...(options.version !== undefined ? { version: options.version } : {}),
            rules: driverRules,
          },
        },
        results: report.findings.map((f) => toResult(f)),
      },
    ],
  };
  return JSON.stringify(log, null, 2);
}

function toResult(f: Finding): unknown {
  // SARIF 2.1.0 §3.30.6: startColumn SHALL NOT appear without startLine, so
  // only emit a column when a line is present (GitHub code scanning rejects
  // a region that violates this).
  const region: Record<string, number> = {};
  if (f.line !== undefined) {
    region["startLine"] = f.line;
    if (f.column !== undefined) region["startColumn"] = f.column;
  }
  return {
    ruleId: f.ruleId,
    level: SARIF_LEVEL[f.severity],
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file },
          ...(Object.keys(region).length > 0 ? { region } : {}),
        },
      },
    ],
  };
}
