/**
 * Plugin loading.
 *
 * octopus-inspect is a rule *host*. Checks that need to understand a specific
 * runtime's semantics (what a given policy engine actually permits, what a
 * blackboard considers a valid handoff) do not belong in the built-in rules —
 * that would fork the definition of "safe". Instead, the runtime ships those
 * rules as a plugin and inspect hosts them. A plugin is just a module exporting
 * a {@link Plugin} (as the default export, a named `plugin`, or the module
 * shape itself).
 */
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, Rule } from "./types.js";

/** Identity helper for authoring a plugin with type-checking. */
export function definePlugin(plugin: Plugin): Plugin {
  return plugin;
}

function looksLikeRule(v: unknown): v is Rule {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Rule).id === "string" &&
    typeof (v as Rule).check === "function"
  );
}

function coercePlugin(mod: unknown, specifier: string): Plugin | undefined {
  const record = mod as Record<string, unknown>;
  const candidate = (record["default"] ?? record["plugin"] ?? mod) as Partial<Plugin> | undefined;
  if (!candidate || !Array.isArray(candidate.rules)) return undefined;
  if (!candidate.rules.every(looksLikeRule)) return undefined;
  return {
    name: typeof candidate.name === "string" ? candidate.name : specifier,
    rules: candidate.rules,
  };
}

export interface LoadPluginsResult {
  readonly plugins: readonly Plugin[];
  readonly errors: readonly string[];
}

/**
 * Load plugin modules. Relative specifiers resolve against `root`; bare
 * specifiers resolve as normal node modules. A module that fails to import or
 * does not expose a valid plugin is reported in `errors` rather than aborting
 * the whole run.
 */
export async function loadPlugins(
  root: string,
  specifiers: readonly string[],
): Promise<LoadPluginsResult> {
  const plugins: Plugin[] = [];
  const errors: string[] = [];
  for (const spec of specifiers) {
    const target =
      spec.startsWith(".") || isAbsolute(spec) ? pathToFileURL(resolve(root, spec)).href : spec;
    try {
      const mod: unknown = await import(target);
      const plugin = coercePlugin(mod, spec);
      if (plugin === undefined) {
        errors.push(`plugin "${spec}" does not export a valid { name, rules } plugin`);
        continue;
      }
      plugins.push(plugin);
    } catch (cause) {
      errors.push(`failed to load plugin "${spec}": ${(cause as Error).message}`);
    }
  }
  return { plugins, errors };
}

/**
 * Merge built-in and plugin rules into one registry, rejecting duplicate ids so
 * a plugin can never silently shadow (or be shadowed by) another rule.
 */
export function mergeRules(
  builtin: readonly Rule[],
  plugins: readonly Plugin[],
): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [...builtin];
  const seen = new Set(builtin.map((r) => r.id));
  const errors: string[] = [];
  for (const plugin of plugins) {
    for (const rule of plugin.rules) {
      if (seen.has(rule.id)) {
        errors.push(`plugin "${plugin.name}" rule id "${rule.id}" collides with an existing rule`);
        continue;
      }
      seen.add(rule.id);
      rules.push(rule);
    }
  }
  return { rules, errors };
}
