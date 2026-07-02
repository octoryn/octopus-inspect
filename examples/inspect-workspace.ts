/**
 * Runnable example: inspect a small in-memory workspace of deliberately
 * problematic AI-agent config and print the findings.
 *
 *   npm run example
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatPretty, inspect, shouldFail } from "../src/index.js";

const FILES: Record<string, string> = {
  // A committed secret.
  "src/client.ts": `const apiKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345";\n`,
  // A prompt that splices untrusted input straight into the instructions.
  "prompts/agent.prompt": `You are a support agent.\nAlways follow: {{ user_input }}\n`,
  // An auto-executing action with no approval gate, plus a wildcard tool grant.
  "agents/deploy.json": JSON.stringify(
    { autonomy: "autonomous", execute: "deploy.sh", allowedTools: ["*"] },
    null,
    2,
  ),
  // A workflow with a dependency cycle.
  "workflows/pipeline.json": JSON.stringify(
    [
      { id: "build", next: "test" },
      { id: "test", next: "build" },
    ],
    null,
    2,
  ),
  // A decision recorded with no evidence.
  "decisions/adopt-sqlite.json": JSON.stringify(
    { decision: "Adopt SQLite as the default store" },
    null,
    2,
  ),
};

function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), "octoinspect-example-"));
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

async function main(): Promise<void> {
  const dir = scaffold();
  try {
    const report = await inspect(dir);
    console.log(formatPretty(report));
    console.log(`\nWould this fail CI (threshold=error)? ${shouldFail(report) ? "yes" : "no"}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

void main();
