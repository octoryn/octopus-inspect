import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyEvidence, type Evidence } from "octopus-evidence";
import { inspect } from "../src/engine.js";
import { builtinRules } from "../src/rules/index.js";
import { formatEvidence, reportEvidence } from "../src/report/index.js";
import type { InspectReport, Rule } from "../src/types.js";
import { cleanup, makeWorkspace } from "./helpers.js";

/** A fixed clock so every rendered evidence is byte-stable across runs. */
const AT = "2026-07-03T00:00:00.000Z";

/** Resolve OWASP tags from the built-in rules, mirroring the CLI wiring. */
function owaspFor(id: string): readonly string[] | undefined {
  const rule = builtinRules.find((r: Rule) => r.id === id);
  return rule?.owasp && rule.owasp.length > 0 ? rule.owasp : undefined;
}

/** Inspect a fixture that trips both a secret (error) and a wildcard grant (warning). */
async function inspectFixture(): Promise<{ report: InspectReport; dir: string }> {
  const dir = makeWorkspace({
    "leak.ts": "const id = 'AKIA1234567890ABCDEF';\n",
    "perm.json": JSON.stringify({ allowedTools: ["*"] }),
  });
  const report = await inspect(dir, { rules: builtinRules });
  return { report, dir };
}

test("every emitted evidence verifies (tamper-evident, no secret)", async () => {
  const { report, dir } = await inspectFixture();
  try {
    assert.ok(report.findings.length >= 2, "fixture should produce findings");
    const evidence = reportEvidence(report, { at: AT, owaspFor });
    assert.equal(evidence.length, report.findings.length);
    for (const ev of evidence) {
      assert.equal(verifyEvidence(ev), true);
    }
  } finally {
    cleanup(dir);
  }
});

test("kind / subject / content faithfully reflect each finding", async () => {
  const { report, dir } = await inspectFixture();
  try {
    const evidence = reportEvidence(report, { at: AT, owaspFor });
    report.findings.forEach((f, i) => {
      const ev = evidence[i]!;
      assert.equal(ev.kind, `governance-finding:${f.ruleId}`);
      // Subject always carries the file as a `file` ref.
      const fileRef = ev.subject.find((r) => r.type === "file");
      assert.ok(fileRef, "subject must include a file ref");
      assert.equal(fileRef!.id, f.file);
      // When the finding is localized, a location ref is present.
      if (f.line !== undefined) {
        const locRef = ev.subject.find((r) => r.type === "location");
        assert.ok(locRef, "localized finding must carry a location ref");
        assert.ok(locRef!.id.startsWith(`${f.file}:`));
      }
      // Content mirrors the finding's canonical detail.
      const content = ev.content as Record<string, unknown>;
      assert.equal(content["ruleId"], f.ruleId);
      assert.equal(content["severity"], f.severity);
      assert.equal(content["message"], f.message);
      assert.equal(content["file"], f.file);
      if (f.line !== undefined) assert.equal(content["line"], f.line);
      // Provenance identifies the linter and the fixed clock.
      assert.equal(ev.provenance.source, "octopus-inspect");
      assert.equal(ev.provenance.method, "static-analysis");
      assert.equal(ev.provenance.at, AT);
    });
  } finally {
    cleanup(dir);
  }
});

test("OWASP tags survive into evidence content", async () => {
  const { report, dir } = await inspectFixture();
  try {
    const evidence = reportEvidence(report, { at: AT, owaspFor });
    // secret-in-source and overbroad-permission both map to ASI03.
    const secret = evidence.find((e) => e.kind === "governance-finding:secret-in-source");
    assert.ok(secret, "expected a secret-in-source evidence");
    const content = secret!.content as Record<string, unknown>;
    assert.deepEqual(content["owasp"], ["ASI03"]);
  } finally {
    cleanup(dir);
  }
});

test("evidence output is deterministic across two runs (same bytes)", async () => {
  const { report, dir } = await inspectFixture();
  try {
    const a = formatEvidence(report, { at: AT, owaspFor });
    const b = formatEvidence(report, { at: AT, owaspFor });
    assert.equal(a, b);
    // Independently re-inspecting the same tree yields identical bytes too.
    const report2 = await inspect(dir, { rules: builtinRules });
    const c = formatEvidence(report2, { at: AT, owaspFor });
    assert.equal(a, c);
  } finally {
    cleanup(dir);
  }
});

test("keyed-secret round-trip: verifies with the key, fails without it", async () => {
  const { report, dir } = await inspectFixture();
  try {
    const secret = "audit-key-2026";
    const evidence = reportEvidence(report, { at: AT, owaspFor, integritySecret: secret });
    for (const ev of evidence) {
      assert.equal(verifyEvidence(ev, secret), true);
      // Without the key (or with a wrong key), verification fails.
      assert.equal(verifyEvidence(ev), false);
      assert.equal(verifyEvidence(ev, "wrong-key"), false);
    }
  } finally {
    cleanup(dir);
  }
});

test("tampering with stored content is detected", async () => {
  const { report, dir } = await inspectFixture();
  try {
    const [ev] = reportEvidence(report, { at: AT, owaspFor });
    assert.ok(ev);
    const tampered: Evidence = {
      ...ev,
      content: {
        ...(ev.content as Record<string, unknown>),
        severity: "info",
      } as Evidence["content"],
    };
    assert.equal(verifyEvidence(tampered), false);
  } finally {
    cleanup(dir);
  }
});
