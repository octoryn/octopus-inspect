/** The built-in rule set. All rules here are static and self-contained. */
import type { Rule } from "../types.js";
import { secretInSource } from "./secret-in-source.js";
import { promptInjectionSink } from "./prompt-injection-sink.js";
import { unsafeAutonomy } from "./unsafe-autonomy.js";
import { overbroadPermission } from "./overbroad-permission.js";
import { missingEvidence } from "./missing-evidence.js";
import { circularWorkflow } from "./circular-workflow.js";
import { unpinnedAgentDependency } from "./unpinned-agent-dependency.js";

export const builtinRules: readonly Rule[] = [
  secretInSource,
  promptInjectionSink,
  unsafeAutonomy,
  overbroadPermission,
  missingEvidence,
  circularWorkflow,
  unpinnedAgentDependency,
];

export {
  secretInSource,
  promptInjectionSink,
  unsafeAutonomy,
  overbroadPermission,
  missingEvidence,
  circularWorkflow,
  unpinnedAgentDependency,
};
