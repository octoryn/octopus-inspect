/**
 * Rule: missing-evidence — a recorded decision or claim with no provenance.
 *
 * A decision/claim asserted with no evidence, source, or rationale is a
 * hypothesis wearing the clothes of a fact. This structurally flags records
 * that state a conclusion but carry no supporting field. It checks shape only —
 * it does not judge whether the evidence is *good*, only that some is present.
 */
import type { JsonObject } from "../jsonc.js";
import type { RawFinding, Rule, Workspace } from "../types.js";
import { isJsonObject, walkJson } from "../jsonc.js";
import { findKeyLine, parsedJsonFiles } from "./helpers.js";

const CLAIM_KEYS = [
  "decision",
  "claim",
  "conclusion",
  "ruling",
  "verdict",
  "resolution",
  "assertion",
];

const EVIDENCE_KEYS = [
  "evidence",
  "provenance",
  "source",
  "sources",
  "rationale",
  "reason",
  "reasoning",
  "citation",
  "citations",
  "justification",
  "basis",
  "proof",
  "reference",
  "references",
];

function normalizedKeys(obj: JsonObject): Set<string> {
  return new Set(Object.keys(obj).map((k) => k.toLowerCase().replace(/[_-]/g, "")));
}

function isMeaningful(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

export const missingEvidence: Rule = {
  id: "missing-evidence",
  title: "Decision or claim recorded without evidence",
  description:
    "Structurally flags a record that states a decision/claim/conclusion but carries no evidence, source, rationale, or citation field. Every asserted causal edge should carry provenance or stay a hypothesis.",
  severity: "warning",
  check(workspace: Workspace): RawFinding[] {
    const findings: RawFinding[] = [];
    for (const { file, root, lines } of parsedJsonFiles(workspace)) {
      walkJson(root, (node) => {
        if (!isJsonObject(node.value)) return;
        const obj = node.value;
        const keys = normalizedKeys(obj);

        const claimKey = CLAIM_KEYS.find((k) => keys.has(k));
        if (claimKey === undefined) return;
        // Require the claim field itself to hold a real value.
        const claimOriginal = Object.keys(obj).find(
          (k) => k.toLowerCase().replace(/[_-]/g, "") === claimKey,
        );
        if (claimOriginal === undefined || !isMeaningful(obj[claimOriginal])) return;

        const hasEvidence = EVIDENCE_KEYS.some((k) => {
          if (!keys.has(k)) return false;
          const original = Object.keys(obj).find(
            (ok) => ok.toLowerCase().replace(/[_-]/g, "") === k,
          );
          return original !== undefined && isMeaningful(obj[original]);
        });
        if (hasEvidence) return;

        const line = findKeyLine(lines, claimOriginal);
        findings.push({
          message: `Recorded ${claimKey} has no evidence, source, or rationale`,
          file: file.path,
          ...(line !== undefined ? { line } : {}),
          excerpt: claimOriginal,
          suggestion:
            "Attach an evidence/source/rationale field, or mark the record as an unverified hypothesis.",
        });
      });
    }
    return findings;
  },
};
