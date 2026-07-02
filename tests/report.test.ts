import { test } from "node:test";
import assert from "node:assert/strict";
import { formatJson, formatPretty, formatSarif } from "../src/report/index.js";
import type { InspectReport } from "../src/types.js";

const empty: InspectReport = {
  root: "/tmp/ws",
  findings: [],
  fileCount: 3,
  ruleCount: 7,
  summary: { error: 0, warning: 0, info: 0 },
};

const report: InspectReport = {
  root: "/tmp/ws",
  fileCount: 2,
  ruleCount: 7,
  summary: { error: 1, warning: 1, info: 0 },
  findings: [
    {
      ruleId: "secret-in-source",
      severity: "error",
      message: "secret found",
      file: "a.ts",
      line: 3,
      column: 5,
    },
    {
      ruleId: "overbroad-permission",
      severity: "warning",
      message: "wildcard grant",
      file: "b.json",
      line: 2,
    },
  ],
};

test("formatPretty shows a clean message when there are no findings", () => {
  const out = formatPretty(empty);
  assert.ok(out.includes("no findings"));
  assert.ok(!out.includes("\x1b["));
});

test("formatPretty lists findings grouped by file with a summary", () => {
  const out = formatPretty(report);
  assert.ok(out.includes("a.ts"));
  assert.ok(out.includes("secret found"));
  assert.ok(out.includes("3:5"));
  assert.ok(out.includes("2 problems (1 error, 1 warning)"));
});

test("formatPretty emits ANSI only when color is enabled", () => {
  assert.ok(formatPretty(report, { color: true }).includes("\x1b["));
  assert.ok(!formatPretty(report, { color: false }).includes("\x1b["));
});

test("formatJson round-trips the report", () => {
  const parsed = JSON.parse(formatJson(report)) as InspectReport;
  assert.equal(parsed.findings.length, 2);
  assert.equal(parsed.summary.error, 1);
});

test("formatSarif emits a valid 2.1.0 log with mapped levels", () => {
  const sarif = JSON.parse(formatSarif(report, { version: "0.1.0" })) as {
    version: string;
    runs: {
      tool: { driver: { name: string; version?: string; rules: { id: string }[] } };
      results: { ruleId: string; level: string }[];
    }[];
  };
  assert.equal(sarif.version, "2.1.0");
  const run = sarif.runs[0]!;
  assert.equal(run.tool.driver.name, "octopus-inspect");
  assert.equal(run.tool.driver.version, "0.1.0");
  assert.equal(run.results.length, 2);
  assert.equal(run.results[0]!.level, "error");
  assert.equal(run.results[1]!.level, "warning");
  // Only rules that actually fired are described.
  assert.deepEqual(run.tool.driver.rules.map((r) => r.id).sort(), [
    "overbroad-permission",
    "secret-in-source",
  ]);
});

test("formatSarif never emits startColumn without startLine (SARIF 2.1.0)", () => {
  const columnOnly: InspectReport = {
    root: "/tmp/ws",
    fileCount: 1,
    ruleCount: 1,
    summary: { error: 0, warning: 1, info: 0 },
    // A (plugin-shaped) finding with a column but no line.
    findings: [{ ruleId: "x", severity: "warning", message: "m", file: "a.ts", column: 5 }],
  };
  const sarif = JSON.parse(formatSarif(columnOnly)) as {
    runs: {
      results: { locations: { physicalLocation: { region?: Record<string, number> } }[] }[];
    }[];
  };
  const region = sarif.runs[0]!.results[0]!.locations[0]!.physicalLocation.region;
  // No line → the region must be omitted entirely (not { startColumn } alone).
  assert.equal(region, undefined);
});
