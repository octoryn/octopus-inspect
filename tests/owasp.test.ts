import { test } from "node:test";
import assert from "node:assert/strict";
import { builtinRules, formatSarif, OWASP_AGENTIC_2026, owaspLabel } from "../src/index.js";
import type { InspectReport } from "../src/index.js";

test("every built-in rule maps to at least one valid OWASP Agentic 2026 category", () => {
  for (const r of builtinRules) {
    assert.ok(r.owasp && r.owasp.length > 0, `${r.id} has no OWASP mapping`);
    for (const id of r.owasp) {
      assert.ok(id in OWASP_AGENTIC_2026, `${r.id} maps to unknown category ${id}`);
    }
  }
});

test("the OWASP catalog has all ten 2026 categories", () => {
  assert.equal(Object.keys(OWASP_AGENTIC_2026).length, 10);
  assert.equal(OWASP_AGENTIC_2026.ASI01, "Agent Goal Hijack");
  assert.equal(OWASP_AGENTIC_2026.ASI10, "Rogue Agents");
});

test("owaspLabel formats 'id: title', or the id alone if unknown", () => {
  assert.equal(owaspLabel("ASI01"), "ASI01: Agent Goal Hijack");
  assert.equal(owaspLabel("ASI99"), "ASI99");
});

test("SARIF rule descriptors carry the OWASP tags and structured mapping", () => {
  const report: InspectReport = {
    root: "/tmp/ws",
    fileCount: 1,
    ruleCount: 1,
    summary: { error: 0, warning: 1, info: 0 },
    findings: [
      { ruleId: "prompt-injection-sink", severity: "warning", message: "m", file: "a.prompt" },
    ],
  };
  const sarif = JSON.parse(formatSarif(report)) as {
    runs: {
      tool: {
        driver: {
          rules: {
            id: string;
            properties?: {
              tags?: string[];
              "owasp-agentic-2026"?: { id: string; title: string }[];
            };
          }[];
        };
      };
    }[];
  };
  const rule = sarif.runs[0]!.tool.driver.rules.find((r) => r.id === "prompt-injection-sink");
  assert.ok(rule, "prompt-injection-sink rule descriptor present");
  assert.ok(rule!.properties?.tags?.includes("OWASP-ASI-2026:ASI01"));
  assert.equal(rule!.properties?.["owasp-agentic-2026"]?.[0]?.title, "Agent Goal Hijack");
});
