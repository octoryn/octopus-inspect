/** Human-readable reporter: findings grouped by file, with a summary line. */
import type { Finding, InspectReport, Severity } from "../types.js";

const LABEL: Record<Severity, string> = { error: "error", warning: "warning", info: "info" };

export interface PrettyOptions {
  /** Emit ANSI color. Defaults to false for deterministic, CI-friendly output. */
  readonly color?: boolean;
}

const COLOR: Record<Severity, string> = {
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
};
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/** Render a report as a multi-line human-readable string. */
export function formatPretty(report: InspectReport, options: PrettyOptions = {}): string {
  const color = options.color ?? false;
  const paint = (code: string, s: string): string => (color ? `${code}${s}${RESET}` : s);

  if (report.findings.length === 0) {
    return paint(DIM, `✔ no findings — ${report.fileCount} files, ${report.ruleCount} rules`);
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of report.findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const out: string[] = [];
  for (const [file, findings] of byFile) {
    out.push(paint(BOLD, file));
    for (const f of findings) {
      const loc = f.line !== undefined ? `${f.line}:${f.column ?? 1}` : "-";
      out.push(
        `  ${loc.padEnd(7)} ${paint(COLOR[f.severity], LABEL[f.severity].padEnd(7))} ` +
          `${paint(DIM, f.ruleId.padEnd(26))} ${f.message}`,
      );
    }
    out.push("");
  }

  const { error, warning, info } = report.summary;
  const total = error + warning + info;
  const parts = [
    `${error} error${error === 1 ? "" : "s"}`,
    `${warning} warning${warning === 1 ? "" : "s"}`,
  ];
  if (info > 0) parts.push(`${info} info`);
  const mark = error > 0 ? paint(COLOR.error, "✖") : paint(COLOR.warning, "⚠");
  out.push(`${mark} ${total} problem${total === 1 ? "" : "s"} (${parts.join(", ")})`);
  return out.join("\n");
}
