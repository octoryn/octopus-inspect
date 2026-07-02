import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, shouldFail } from "../src/engine.js";
import type { Rule } from "../src/types.js";
import { cleanup, makeWorkspace } from "./helpers.js";

const noiseRule: Rule = {
  id: "test-noise",
  title: "noise",
  description: "emits one finding per file for ordering tests",
  severity: "warning",
  check(ws) {
    return ws.files.map((f) => ({ message: "noise", file: f.path, line: 1 }));
  },
};

test("inspect returns a deterministic, sorted report", async () => {
  const dir = makeWorkspace({ "b.txt": "x", "a.txt": "y" });
  try {
    const r1 = await inspect(dir, { rules: [noiseRule] });
    const r2 = await inspect(dir, { rules: [noiseRule] });
    assert.deepEqual(
      r1.findings.map((f) => f.file),
      ["a.txt", "b.txt"],
    );
    assert.deepEqual(r1, r2);
    assert.equal(r1.fileCount, 2);
    assert.equal(r1.ruleCount, 1);
    assert.equal(r1.summary.warning, 2);
  } finally {
    cleanup(dir);
  }
});

test("config can disable a rule and override severity", async () => {
  const dir = makeWorkspace({ "a.txt": "x" });
  try {
    const off = await inspect(dir, {
      rules: [noiseRule],
      config: { rules: { "test-noise": "off" } },
    });
    assert.equal(off.findings.length, 0);

    const bumped = await inspect(dir, {
      rules: [noiseRule],
      config: { rules: { "test-noise": "error" } },
    });
    assert.equal(bumped.findings[0]!.severity, "error");
    assert.equal(bumped.summary.error, 1);
  } finally {
    cleanup(dir);
  }
});

test("shouldFail respects the threshold", async () => {
  const dir = makeWorkspace({ "a.txt": "x" });
  try {
    const report = await inspect(dir, { rules: [noiseRule] }); // one warning
    assert.equal(shouldFail(report, "error"), false);
    assert.equal(shouldFail(report, "warning"), true);
    assert.equal(shouldFail(report, "info"), true);
  } finally {
    cleanup(dir);
  }
});

test("a throwing rule is isolated as an error finding, not a crash", async () => {
  const dir = makeWorkspace({ "a.txt": "x" });
  const boom: Rule = {
    id: "boom",
    title: "boom",
    description: "d",
    severity: "warning",
    check: () => {
      throw new Error("kaboom");
    },
  };
  // A rule that throws a non-Error value (even null) must also be isolated,
  // not crash the catch block itself.
  const nullThrower: Rule = {
    id: "null-throw",
    title: "n",
    description: "d",
    severity: "warning",
    check: () => {
      throw null;
    },
  };
  try {
    const report = await inspect(dir, { rules: [boom, nullThrower, noiseRule] });
    // The scan completes: both crashing rules yield error findings, and the
    // other rule still runs.
    assert.ok(report.findings.some((f) => f.ruleId === "boom" && f.severity === "error"));
    assert.ok(report.findings.some((f) => f.ruleId === "null-throw" && f.severity === "error"));
    assert.ok(report.findings.some((f) => f.ruleId === "test-noise"));
  } finally {
    cleanup(dir);
  }
});

test("engine attaches ruleId and resolves per-finding severity", async () => {
  const dir = makeWorkspace({ "a.txt": "x" });
  const graded: Rule = {
    id: "graded",
    title: "graded",
    description: "d",
    severity: "info",
    check: (ws) =>
      ws.files.map((f) => ({ message: "m", file: f.path, severity: "error" as const })),
  };
  try {
    const report = await inspect(dir, { rules: [graded] });
    assert.equal(report.findings[0]!.ruleId, "graded");
    assert.equal(report.findings[0]!.severity, "error");
  } finally {
    cleanup(dir);
  }
});
