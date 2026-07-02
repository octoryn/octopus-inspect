/** Configuration loading and rule-setting resolution. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InspectConfig, RuleSetting, Severity } from "./types.js";
import { parseJsonc, isJsonObject } from "./jsonc.js";
import { SEVERITIES } from "./types.js";

/** Default filename looked up at the workspace root. */
export const CONFIG_FILENAME = ".octoinspect.json";

/**
 * Load `.octoinspect.json` from `root` if present. A malformed or absent config
 * yields an empty config (the run proceeds with defaults) — configuration is
 * advisory, never a hard gate on being able to inspect.
 */
export function loadConfig(root: string): InspectConfig {
  let raw: string;
  try {
    raw = readFileSync(join(root, CONFIG_FILENAME), "utf8");
  } catch {
    return {};
  }
  const parsed = parseJsonc(raw);
  if (!isJsonObject(parsed)) return {};
  return normalizeConfig(parsed);
}

/** Coerce an untrusted parsed object into a well-typed {@link InspectConfig}. */
export function normalizeConfig(input: Record<string, unknown>): InspectConfig {
  const config: {
    ignore?: string[];
    rules?: Record<string, RuleSetting>;
    plugins?: string[];
    maxFileBytes?: number;
  } = {};

  if (Array.isArray(input["ignore"])) {
    config.ignore = input["ignore"].filter((v): v is string => typeof v === "string");
  }
  if (Array.isArray(input["plugins"])) {
    config.plugins = input["plugins"].filter((v): v is string => typeof v === "string");
  }
  // Must be a positive size; a zero/negative value would silently skip every
  // file and turn a real scan into an empty (falsely-clean) run.
  if (
    typeof input["maxFileBytes"] === "number" &&
    Number.isFinite(input["maxFileBytes"]) &&
    input["maxFileBytes"] > 0
  ) {
    config.maxFileBytes = input["maxFileBytes"];
  }
  const rules = input["rules"];
  if (isJsonObject(rules)) {
    const resolved: Record<string, RuleSetting> = {};
    for (const [id, setting] of Object.entries(rules)) {
      if (setting === "off" || isSeverity(setting)) resolved[id] = setting;
    }
    config.rules = resolved;
  }
  return config;
}

export function isSeverity(v: unknown): v is Severity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

/** Is a rule enabled under this config? (Unlisted rules are enabled.) */
export function isRuleEnabled(ruleId: string, config: InspectConfig): boolean {
  return config.rules?.[ruleId] !== "off";
}

/**
 * Effective severity for a finding: config override wins, then the finding's
 * own severity, then the rule's default.
 */
export function resolveSeverity(
  ruleId: string,
  ruleDefault: Severity,
  findingSeverity: Severity | undefined,
  config: InspectConfig,
): Severity {
  const setting = config.rules?.[ruleId];
  if (setting && setting !== "off") return setting;
  return findingSeverity ?? ruleDefault;
}
