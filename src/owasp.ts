/**
 * OWASP Top 10 for Agentic Applications (2026) — the industry's shared risk
 * taxonomy (genai.owasp.org). Each built-in rule declares the category (or
 * categories) it addresses, so findings map onto the vocabulary security teams
 * already use, and the mapping is surfaced in SARIF for code scanning.
 *
 * Inspect's static rules address a *subset* of the Top 10 — the risks visible in
 * committed workspace config. Runtime-only risks (e.g. cascading failures at
 * execution time) are out of a static linter's scope by design.
 */
export type OwaspAgenticId =
  "ASI01" | "ASI02" | "ASI03" | "ASI04" | "ASI05" | "ASI06" | "ASI07" | "ASI08" | "ASI09" | "ASI10";

/** Id → official 2026 title. */
export const OWASP_AGENTIC_2026: Readonly<Record<OwaspAgenticId, string>> = {
  ASI01: "Agent Goal Hijack",
  ASI02: "Tool Misuse and Exploitation",
  ASI03: "Identity and Privilege Abuse",
  ASI04: "Agentic Supply Chain Vulnerabilities",
  ASI05: "Unexpected Code Execution",
  ASI06: "Memory and Context Poisoning",
  ASI07: "Insecure Inter-Agent Communication",
  ASI08: "Cascading Failures",
  ASI09: "Human-Agent Trust Exploitation",
  ASI10: "Rogue Agents",
};

/** The official 2026 title for a category id, or undefined if unknown. */
export function owaspTitle(id: string): string | undefined {
  return (OWASP_AGENTIC_2026 as Record<string, string>)[id];
}

/** `"ASI01: Agent Goal Hijack"` — a human-readable label for a category id. */
export function owaspLabel(id: string): string {
  const title = owaspTitle(id);
  return title === undefined ? id : `${id}: ${title}`;
}
