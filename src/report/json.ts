/** Machine-readable JSON reporter. */
import type { InspectReport } from "../types.js";

/** Stable, pretty-printed JSON of the full report. */
export function formatJson(report: InspectReport): string {
  return JSON.stringify(report, null, 2);
}
