/**
 * Rule: secret-in-source — hardcoded credentials committed to the workspace.
 *
 * Flags well-known credential shapes (cloud keys, provider API keys, private
 * key blocks) and generic `secret = "…"` assignments, while filtering obvious
 * placeholders so `.env.example`-style files stay quiet. The matched secret is
 * redacted in the finding — the report never echoes a full credential.
 */
import type { RawFinding, Rule, Workspace } from "../types.js";
import { redact } from "../util.js";

interface Detector {
  readonly name: string;
  readonly re: RegExp;
  /** Capture group holding the secret (0 = whole match). */
  readonly group?: number;
}

const DETECTORS: readonly Detector[] = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: "OpenAI API key", re: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: "hardcoded credential",
    re: /\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)\b["']?\s*[:=]\s*["']([^"'\s]{12,})["']/i,
    group: 1,
  },
];

/** Substrings that mark a value as a placeholder rather than a real secret. */
const PLACEHOLDER = [
  "changeme",
  "your-",
  "your_",
  "example",
  "placeholder",
  "dummy",
  "redacted",
  "xxxx",
  "<",
  "${",
  "process.env",
  "os.environ",
  "insert",
  "todo",
];

function isPlaceholder(value: string): boolean {
  const v = value.toLowerCase();
  if (PLACEHOLDER.some((p) => v.includes(p))) return true;
  // A value that is a single repeated character (e.g. "aaaaaaaaaaaa") is noise.
  return /^(.)\1+$/.test(value);
}

export const secretInSource: Rule = {
  id: "secret-in-source",
  title: "Hardcoded secret committed to the workspace",
  description:
    "Detects credentials (cloud keys, provider API keys, private keys, generic secret assignments) checked into files. Secrets belong in a secret manager or environment, never in the tree.",
  severity: "error",
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const file of workspace.files) {
      if (file.binary) continue;
      const lines = file.lines();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const seen = new Set<string>();
        for (const detector of DETECTORS) {
          const m = detector.re.exec(line);
          if (!m) continue;
          const secret = detector.group !== undefined ? m[detector.group] : m[0];
          if (secret === undefined) continue;
          if (detector.group !== undefined && isPlaceholder(secret)) continue;
          const key = `${detector.name}:${secret}`;
          if (seen.has(key)) continue;
          seen.add(key);
          findings.push({
            message: `Possible ${detector.name} committed to source`,
            file: file.path,
            line: i + 1,
            column: m.index + 1,
            excerpt: redact(secret),
            suggestion:
              "Move the secret to an environment variable or secret manager and rotate it.",
          });
        }
      }
    }
    return findings;
  },
};
