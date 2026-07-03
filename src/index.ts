/**
 * octopus-inspect — catch governance holes before production does.
 *
 * A static governance linter for AI agent workspaces. It is a *rule host*: an
 * engine that walks a workspace and runs governance rules over it, producing
 * deterministic findings. Built-in rules are all static and self-contained;
 * checks that need a specific runtime's semantics arrive as plugins, so there is
 * a single source of truth for what "safe" means.
 *
 *   Workspace → Rules → Findings → Report (pretty / json / sarif / evidence)
 */

// Engine.
export { inspect, shouldFail } from "./engine.js";
export type { InspectOptions } from "./engine.js";

// Core contracts.
export type {
  Severity,
  Finding,
  RawFinding,
  Rule,
  Plugin,
  Workspace,
  WorkspaceFile,
  InspectConfig,
  InspectReport,
  RuleSetting,
} from "./types.js";
export { SEVERITIES } from "./types.js";

// Workspace.
export { buildWorkspace, DEFAULT_IGNORES } from "./workspace.js";
export type { BuildWorkspaceOptions } from "./workspace.js";

// Config.
export {
  loadConfig,
  normalizeConfig,
  isRuleEnabled,
  resolveSeverity,
  CONFIG_FILENAME,
} from "./config.js";

// OWASP Top 10 for Agentic Applications (2026) mapping.
export { OWASP_AGENTIC_2026, owaspTitle, owaspLabel } from "./owasp.js";
export type { OwaspAgenticId } from "./owasp.js";

// Rules.
export { builtinRules } from "./rules/index.js";
export {
  secretInSource,
  promptInjectionSink,
  unsafeAutonomy,
  overbroadPermission,
  missingEvidence,
  circularWorkflow,
  unpinnedAgentDependency,
} from "./rules/index.js";

// Plugins.
export { definePlugin, loadPlugins, mergeRules } from "./plugin.js";
export type { LoadPluginsResult } from "./plugin.js";

// Reporters.
export {
  formatPretty,
  formatJson,
  formatSarif,
  formatEvidence,
  reportEvidence,
  serializeEvidence,
  findingToEvidence,
  EVIDENCE_SOURCE,
  EVIDENCE_METHOD,
} from "./report/index.js";
export type {
  PrettyOptions,
  SarifOptions,
  EvidenceOptions,
  EvidenceReportOptions,
  FindingContent,
  ReportFormat,
} from "./report/index.js";

// JSON helpers (useful when authoring structural plugin rules).
export { parseJsonc, walkJson, isJsonObject, findKeyLine } from "./jsonc.js";
export type { JsonValue, JsonObject, JsonNode } from "./jsonc.js";
