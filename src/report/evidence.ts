/**
 * EVIDENCE reporter — turn each governance finding into a tamper-evident,
 * independently-verifiable {@link Evidence}.
 *
 * A finding from a linter is only as trustworthy as the linter. This reporter
 * lifts each finding onto the shared {@link https://github.com/octoryn/octopus-evidence octopus-evidence}
 * primitive: a canonical, hashable, attributable unit anyone can re-verify with
 * `verifyEvidence` — no need to trust (or even re-run) Inspect. That is the
 * audit story for regimes like the EU AI Act (Art. 12 record-keeping, Art. 14
 * human oversight): a finding becomes court-admissible evidence on its own.
 *
 * This is the governance layer of the same evidence spine Observe, Blackboard,
 * Runtime, and Replay already ride: Inspect *validates* evidence, and here it
 * also *emits* it.
 */
import { createEvidence, type Evidence, type JsonValue, type Ref } from "octopus-evidence";
import type { Finding, InspectReport } from "../types.js";

/** Provenance `source` stamped on every emitted evidence. */
export const EVIDENCE_SOURCE = "octopus-inspect";
/** Provenance `method` stamped on every emitted evidence. */
export const EVIDENCE_METHOD = "static-analysis";

export interface EvidenceOptions {
  /**
   * ISO-8601 (RFC 3339) production timestamp stamped into every evidence's
   * provenance. Injecting a fixed clock keeps output deterministic — the whole
   * point of court-admissible evidence is byte-reproducibility, so this reporter
   * NEVER calls `Date.now()` for you. Defaults to the Unix epoch
   * (`1970-01-01T00:00:00.000Z`) so a caller who forgets still gets stable bytes.
   */
  readonly at?: string;
  /**
   * Key the integrity hash (HMAC) instead of a public SHA-256, so no field can
   * be forged or altered without the secret. Optional: with no secret the
   * integrity is a public hash anyone can recompute (tamper-*evident*).
   */
  readonly integritySecret?: string;
}

/** Default production timestamp: a fixed, deterministic clock (the Unix epoch). */
const DEFAULT_AT = "1970-01-01T00:00:00.000Z";

/**
 * The canonical evidentiary detail of a finding, as a JSON payload. This is the
 * `content` sealed into the evidence — everything a reviewer needs to judge the
 * finding without re-running the linter. Optional fields are omitted when absent
 * so the payload (and therefore the hash) is stable.
 */
export interface FindingContent {
  readonly ruleId: string;
  readonly severity: string;
  readonly message: string;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly excerpt?: string;
  readonly suggestion?: string;
  /** OWASP Top 10 for Agentic Applications (2026) categories, when the finding carries them. */
  readonly owasp?: readonly string[];
}

/**
 * Map a single finding to its canonical content payload. OWASP tags are pulled
 * from the finding's rule (findings don't carry the tags themselves) and sealed
 * into `content` so the taxonomy survives into the evidence.
 */
function findingContent(finding: Finding, owasp?: readonly string[]): FindingContent {
  return {
    ruleId: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
    file: finding.file,
    ...(finding.line !== undefined ? { line: finding.line } : {}),
    ...(finding.column !== undefined ? { column: finding.column } : {}),
    ...(finding.excerpt !== undefined ? { excerpt: finding.excerpt } : {}),
    ...(finding.suggestion !== undefined ? { suggestion: finding.suggestion } : {}),
    ...(owasp && owasp.length > 0 ? { owasp: [...owasp] } : {}),
  };
}

/** The subject refs for a finding: the file, plus a precise location when known. */
function findingSubject(finding: Finding): Ref[] {
  const subject: Ref[] = [{ type: "file", id: finding.file }];
  if (finding.line !== undefined) {
    const loc =
      finding.column !== undefined ? `${finding.line}:${finding.column}` : `${finding.line}`;
    subject.push({ type: "location", id: `${finding.file}:${loc}` });
  }
  return subject;
}

/**
 * Turn one finding into a tamper-evident {@link Evidence}. Exposed so callers can
 * evidence a single finding (e.g. to append to an evidence chain).
 *
 * - `kind`     = `governance-finding:${ruleId}`
 * - `subject`  = the finding's file (+ a `location` ref when it can be localized)
 * - `actor`    = the linter itself (`tool:octopus-inspect`)
 * - `content`  = the finding's canonical detail, incl. any OWASP tags
 * - `provenance` = `{ source: octopus-inspect, method: static-analysis, at }`
 */
export function findingToEvidence(
  finding: Finding,
  options: EvidenceOptions & { readonly owasp?: readonly string[] } = {},
): Evidence {
  const at = options.at ?? DEFAULT_AT;
  const createOptions =
    options.integritySecret !== undefined ? { integritySecret: options.integritySecret } : {};
  return createEvidence(
    {
      kind: `governance-finding:${finding.ruleId}`,
      subject: findingSubject(finding),
      actor: { type: "tool", id: EVIDENCE_SOURCE },
      content: findingContent(finding, options.owasp) as unknown as JsonValue,
      provenance: { source: EVIDENCE_SOURCE, method: EVIDENCE_METHOD, at },
    },
    createOptions,
  );
}

/**
 * Map EVERY finding in a report to an {@link Evidence}. Order mirrors the
 * report's deterministic finding order, so two runs over the same report produce
 * byte-identical output. Findings carry no OWASP tags themselves; pass the rule
 * set (or an id→tags map) via {@link EvidenceReportOptions.owaspFor} to seal the
 * taxonomy into each evidence's content.
 */
export interface EvidenceReportOptions extends EvidenceOptions {
  /** Resolve a rule id to its OWASP tags, so they survive into each evidence. */
  readonly owaspFor?: (ruleId: string) => readonly string[] | undefined;
}

/** Build the array of Evidence for a whole report — one per finding. */
export function reportEvidence(
  report: InspectReport,
  options: EvidenceReportOptions = {},
): Evidence[] {
  const base: EvidenceOptions = {};
  if (options.at !== undefined) (base as { at?: string }).at = options.at;
  if (options.integritySecret !== undefined) {
    (base as { integritySecret?: string }).integritySecret = options.integritySecret;
  }
  return report.findings.map((f) => {
    const owasp = options.owaspFor?.(f.ruleId);
    return findingToEvidence(f, { ...base, ...(owasp !== undefined ? { owasp } : {}) });
  });
}

/** Render a report as a JSON array of tamper-evident Evidence (pretty-printed). */
export function formatEvidence(report: InspectReport, options: EvidenceReportOptions = {}): string {
  return serializeEvidence(reportEvidence(report, options));
}

/** JSON-serialize a list of Evidence as a stable, pretty-printed array. */
export function serializeEvidence(evidence: readonly Evidence[]): string {
  return JSON.stringify(evidence, null, 2);
}
