/**
 * Rule: prompt-injection-sink — untrusted input interpolated into a prompt.
 *
 * When a prompt or instruction template splices a user/external variable
 * (`{{ user_input }}`, `${userMessage}`, `{query}`) directly into the
 * instructions, that content can carry adversarial instructions the model then
 * obeys. This flags the sink so a human confirms the input is delimited,
 * escaped, or otherwise contained. It is a heuristic (severity `warning`): the
 * point is to make every such splice a deliberate, reviewed decision.
 */
import type { RawFinding, Rule, Workspace } from "../types.js";
import { lineColAt } from "../util.js";
import { walkJson } from "../jsonc.js";
import { keyMatches, parsedJsonFiles } from "./helpers.js";

/** Interpolation delimiters we understand, each capturing the variable name. */
const TOKENS: readonly RegExp[] = [
  /\{\{\s*([\w.]+)\s*\}\}/g, // {{ handlebars / jinja }}
  /\$\{\s*([\w.]+)\s*\}/g, // ${ template literal }
  /%\(\s*([\w.]+)\s*\)s/g, // %(python)s
];

/** Variable names that indicate untrusted / external content. */
const UNTRUSTED =
  /(?:^|[._])(?:user|input|query|message|content|question|comment|external|untrusted|body|payload)/i;

interface Sink {
  readonly variable: string;
  readonly index: number;
}

/** Find untrusted-variable interpolations inside a single prompt string. */
function scanPromptString(text: string): Sink[] {
  const sinks: Sink[] = [];
  for (const base of TOKENS) {
    const re = new RegExp(base.source, base.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const variable = m[1];
      if (variable && UNTRUSTED.test(variable)) {
        sinks.push({ variable, index: m.index });
      }
    }
  }
  return sinks;
}

const PROMPT_EXTS = new Set([".prompt"]);

function isPromptTextFile(path: string, ext: string): boolean {
  if (PROMPT_EXTS.has(ext)) return true;
  return (ext === ".md" || ext === ".txt" || ext === ".tmpl") && /(^|\/)prompts?\//i.test(path);
}

export const promptInjectionSink: Rule = {
  id: "prompt-injection-sink",
  title: "Untrusted input interpolated into a prompt",
  description:
    "Flags prompt/instruction templates that splice a user- or external-controlled variable directly into the prompt, where it could smuggle in adversarial instructions. Delimit, escape, or validate such input.",
  severity: "warning",
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];

    // 1. Prompt text files: scan the whole file with real line numbers.
    for (const file of workspace.files) {
      if (file.binary) continue;
      if (!isPromptTextFile(file.path, file.ext)) continue;
      const text = file.text();
      for (const sink of scanPromptString(text)) {
        const { line, column } = lineColAt(text, sink.index);
        findings.push(sinkFinding(file.path, sink, line, column));
      }
    }

    // 2. JSON prompt fields: string values under system/instruction/prompt keys.
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        if (typeof node.value !== "string") return;
        if (!keyMatches(node.key, "prompt", "system", "instruction")) return;
        for (const sink of scanPromptString(node.value)) {
          const line = keyLine(lines, node.key);
          findings.push(sinkFinding(file.path, sink, line, undefined));
        }
      });
    }

    return findings;
  },
};

function sinkFinding(
  file: string,
  sink: Sink,
  line: number | undefined,
  column: number | undefined,
): RawFinding {
  return {
    message: `Untrusted variable "${sink.variable}" interpolated into a prompt`,
    file,
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    excerpt: sink.variable,
    suggestion:
      "Delimit or escape external input, or move it to a separate user turn instead of the instructions.",
  };
}

function keyLine(lines: readonly string[], key: string | number | undefined): number | undefined {
  if (typeof key !== "string") return undefined;
  const needle = `"${key}"`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return undefined;
}

// Re-export for tests.
export const _internals = { scanPromptString };
