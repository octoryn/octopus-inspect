/** Reporters: render an {@link InspectReport} in a chosen format. */
export { formatPretty } from "./pretty.js";
export type { PrettyOptions } from "./pretty.js";
export { formatJson } from "./json.js";
export { formatSarif } from "./sarif.js";
export type { SarifOptions } from "./sarif.js";
export {
  formatEvidence,
  reportEvidence,
  serializeEvidence,
  findingToEvidence,
  EVIDENCE_SOURCE,
  EVIDENCE_METHOD,
} from "./evidence.js";
export type { EvidenceOptions, EvidenceReportOptions, FindingContent } from "./evidence.js";

/** Supported output formats. */
export type ReportFormat = "pretty" | "json" | "sarif" | "evidence";
