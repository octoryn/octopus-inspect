import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cleanup, makeWorkspace } from "./helpers.js";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
    encoding: "utf8",
  });
  return { code: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

test("CLI exits 0 and reports no findings on a clean workspace", () => {
  const dir = makeWorkspace({ "src/app.ts": "export const x = 1;\n" });
  try {
    const { code, stdout } = runCli([dir, "--format", "json"]);
    assert.equal(code, 0);
    const report = JSON.parse(stdout) as { findings: unknown[] };
    assert.equal(report.findings.length, 0);
  } finally {
    cleanup(dir);
  }
});

test("CLI exits 1 when a finding meets the default error threshold", () => {
  const dir = makeWorkspace({ "leak.ts": "const id = 'AKIA1234567890ABCDEF';\n" });
  try {
    const { code, stdout } = runCli([dir, "--format", "json"]);
    assert.equal(code, 1);
    const report = JSON.parse(stdout) as { findings: { ruleId: string }[] };
    assert.ok(report.findings.some((f) => f.ruleId === "secret-in-source"));
  } finally {
    cleanup(dir);
  }
});

test("CLI --threshold warning fails on warnings", () => {
  const dir = makeWorkspace({ "perm.json": JSON.stringify({ allowedTools: ["*"] }) });
  try {
    assert.equal(runCli([dir, "--format", "json"]).code, 0); // only a warning
    assert.equal(runCli([dir, "--format", "json", "--threshold", "warning"]).code, 1);
  } finally {
    cleanup(dir);
  }
});

test("CLI --help exits 0 and prints usage", () => {
  const { code, stdout } = runCli(["--help"]);
  assert.equal(code, 0);
  assert.ok(stdout.includes("octopus-inspect"));
  assert.ok(stdout.includes("Usage:"));
});

test("CLI rejects an unknown option with exit 2", () => {
  const { code, stderr } = runCli(["--nope"]);
  assert.equal(code, 2);
  assert.ok(stderr.includes("unknown option"));
});
