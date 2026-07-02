import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkspace } from "../src/workspace.js";
import type { RawFinding, Rule } from "../src/types.js";
import {
  circularWorkflow,
  missingEvidence,
  overbroadPermission,
  promptInjectionSink,
  secretInSource,
  unpinnedAgentDependency,
  unsafeAutonomy,
} from "../src/rules/index.js";
import { cleanup, makeWorkspace } from "./helpers.js";

async function run(rule: Rule, files: Record<string, string>): Promise<RawFinding[]> {
  const dir = makeWorkspace(files);
  try {
    return await rule.check(buildWorkspace(dir));
  } finally {
    cleanup(dir);
  }
}

// --- secret-in-source ---------------------------------------------------------

test("secret-in-source flags known key shapes and generic assignments", async () => {
  const findings = await run(secretInSource, {
    "aws.txt": "id = AKIA1234567890ABCDEF",
    "anthropic.ts": 'const k = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"',
    "config.js": 'const api_key = "s3cr3tValue0192"',
  });
  assert.equal(findings.length, 3);
  assert.ok(findings.every((f) => f.excerpt && f.excerpt.includes("*")));
});

test("secret-in-source ignores placeholders and env references", async () => {
  const findings = await run(secretInSource, {
    ".env.example": 'API_KEY="your-key-here"\nTOKEN="changeme"',
    "read.ts": "const token = process.env.TOKEN",
  });
  assert.equal(findings.length, 0);
});

// --- prompt-injection-sink ----------------------------------------------------

test("prompt-injection-sink flags untrusted interpolation in prompt files and JSON", async () => {
  const findings = await run(promptInjectionSink, {
    "agent.prompt": "You are a helpful bot.\nUser said: {{ user_input }}",
    "config.json": '{ "system": "Follow these rules: ${userMessage}" }',
  });
  assert.equal(findings.length, 2);
});

test("prompt-injection-sink ignores non-untrusted variables", async () => {
  const findings = await run(promptInjectionSink, {
    "agent.prompt": "Today is {{ current_date }} and the topic is {{ subject }}.",
  });
  assert.equal(findings.length, 0);
});

// --- unsafe-autonomy ----------------------------------------------------------

test("unsafe-autonomy flags auto-execute with no gate", async () => {
  const findings = await run(unsafeAutonomy, {
    "wf.json": JSON.stringify({ autonomy: "autonomous", execute: "deploy.sh" }),
  });
  assert.equal(findings.length, 1);
});

test("unsafe-autonomy is quiet when a guard or no side effect is present", async () => {
  const guarded = await run(unsafeAutonomy, {
    "wf.json": JSON.stringify({
      autonomy: "autonomous",
      execute: "deploy.sh",
      approval: { by: "lead" },
    }),
  });
  assert.equal(guarded.length, 0);
  const noEffect = await run(unsafeAutonomy, {
    "wf.json": JSON.stringify({ autonomy: "autonomous", label: "watch only" }),
  });
  assert.equal(noEffect.length, 0);
});

// --- overbroad-permission -----------------------------------------------------

test("overbroad-permission flags wildcard grants", async () => {
  const findings = await run(overbroadPermission, {
    "a.json": JSON.stringify({ allowedTools: ["*"] }),
    "b.json": JSON.stringify({ permissions: "all" }),
  });
  assert.equal(findings.length, 2);
});

test("overbroad-permission allows explicit lists", async () => {
  const findings = await run(overbroadPermission, {
    "a.json": JSON.stringify({ allowedTools: ["read", "write"] }),
  });
  assert.equal(findings.length, 0);
});

// --- missing-evidence ---------------------------------------------------------

test("missing-evidence flags a decision without provenance", async () => {
  const findings = await run(missingEvidence, {
    "d.json": JSON.stringify({ decision: "Adopt SQLite as the default store" }),
  });
  assert.equal(findings.length, 1);
});

test("missing-evidence accepts a decision with evidence", async () => {
  const findings = await run(missingEvidence, {
    "d.json": JSON.stringify({ decision: "Adopt SQLite", evidence: ["benchmark-1"] }),
  });
  assert.equal(findings.length, 0);
});

// --- circular-workflow --------------------------------------------------------

test("circular-workflow detects a cycle in a step array", async () => {
  const findings = await run(circularWorkflow, {
    "wf.json": JSON.stringify([
      { id: "a", next: "b" },
      { id: "b", next: "a" },
    ]),
  });
  assert.equal(findings.length, 1);
  assert.ok(findings[0]!.message.includes("→"));
});

test("circular-workflow detects a cycle in an id-keyed map", async () => {
  const findings = await run(circularWorkflow, {
    "wf.json": JSON.stringify({ steps: { a: { next: "b" }, b: { dependsOn: "a" } } }),
  });
  assert.equal(findings.length, 1);
});

test("circular-workflow is quiet on an acyclic graph", async () => {
  const findings = await run(circularWorkflow, {
    "wf.json": JSON.stringify([{ id: "a", next: "b" }, { id: "b" }]),
  });
  assert.equal(findings.length, 0);
});

test("circular-workflow handles a very long acyclic chain without overflowing", async () => {
  // A 20k-step linear chain would blow a recursive DFS's call stack; the
  // iterative implementation must handle it and report no cycle.
  const steps = Array.from({ length: 20000 }, (_, i) => ({ id: `n${i}`, next: `n${i + 1}` }));
  const findings = await run(circularWorkflow, { "wf.json": JSON.stringify(steps) });
  assert.equal(findings.length, 0);
});

// --- unpinned-agent-dependency ------------------------------------------------

test("unpinned-agent-dependency flags mutable launch args and manifest ranges", async () => {
  const mcp = await run(unpinnedAgentDependency, {
    ".mcp.json": JSON.stringify({
      mcpServers: { x: { command: "npx", args: ["-y", "some-mcp@latest"] } },
    }),
  });
  assert.equal(mcp.length, 1);
  const pkg = await run(unpinnedAgentDependency, {
    "package.json": JSON.stringify({ dependencies: { foo: "latest", bar: "1.2.3" } }),
  });
  assert.equal(pkg.length, 1);
});

test("unpinned-agent-dependency accepts exact pins", async () => {
  const findings = await run(unpinnedAgentDependency, {
    ".mcp.json": JSON.stringify({
      mcpServers: { x: { command: "npx", args: ["-y", "some-mcp@1.4.2"] } },
    }),
  });
  assert.equal(findings.length, 0);
});
