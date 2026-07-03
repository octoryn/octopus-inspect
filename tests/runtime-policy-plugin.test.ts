/**
 * The reference semantic plugin, exercised through inspect's REAL loader and
 * engine — not by calling the rule directly. This proves the plugin composes
 * with the host exactly as a consumer's would: it loads via `loadPlugins`,
 * merges with the built-ins via `mergeRules` (no duplicate-id rejection), and
 * runs through `inspect()`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPlugins, mergeRules } from "../src/plugin.js";
import { inspect } from "../src/engine.js";
import { builtinRules } from "../src/rules/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "inspect-plugins");
// Loaded through the real loader by relative specifier, resolved against the
// plugin dir — tsx imports the .ts directly. This is the same code path the CLI
// uses for a configured `plugins: ["./inspect-plugins/runtime-policy.js"]`.
const PLUGIN_SPEC = "./runtime-policy.ts";

const overAutonomyFixture = resolve(pluginRoot, "fixtures", "over-autonomy");
const safeFixture = resolve(pluginRoot, "fixtures", "safe");
const emptyGateFixture = resolve(pluginRoot, "fixtures", "empty-gate");

test("plugin loads through inspect's real loader without error", async () => {
  const { plugins, errors } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  assert.deepEqual(errors, []);
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0]!.name, "runtime-policy");
  assert.equal(plugins[0]!.rules[0]!.id, "runtime-over-autonomy");
});

test("plugin composes with the built-in rules (no duplicate-id rejection)", async () => {
  const { plugins } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  const { rules, errors } = mergeRules(builtinRules, plugins);
  assert.deepEqual(errors, []);
  // The plugin rule is present alongside every built-in.
  assert.equal(rules.length, builtinRules.length + 1);
  assert.ok(rules.some((r) => r.id === "runtime-over-autonomy"));
  for (const b of builtinRules) assert.ok(rules.some((r) => r.id === b.id));
});

test("flags an over-autonomy fixture (autonomous side-effecting tool, no gate)", async () => {
  const { plugins } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  const { rules } = mergeRules(builtinRules, plugins);
  const report = await inspect(overAutonomyFixture, { rules });

  const hits = report.findings.filter((f) => f.ruleId === "runtime-over-autonomy");
  assert.equal(hits.length, 1, "exactly one over-autonomy finding");
  const hit = hits[0]!;
  assert.equal(hit.severity, "error");
  assert.equal(hit.file, "agents/deploy.json");
  assert.match(hit.message, /autonomous/);
  assert.match(hit.message, /safe ceiling/);
  assert.match(hit.message, /draft/); // ceiling derived from the runtime
  assert.ok(hit.suggestion && hit.suggestion.length > 0);
});

test("a declared-but-empty gate does not silence the rule (false-negative guard)", async () => {
  const { plugins } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  const { rules } = mergeRules(builtinRules, plugins);
  const report = await inspect(emptyGateFixture, { rules });

  const hits = report.findings.filter((f) => f.ruleId === "runtime-over-autonomy");
  assert.equal(
    hits.length,
    1,
    'an empty-string "policy" is not a real gate — rule must still fire',
  );
});

test("silent on a safe fixture (ceiling-bound, read-only, and gated cases)", async () => {
  const { plugins } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  const { rules } = mergeRules(builtinRules, plugins);
  const report = await inspect(safeFixture, { rules });

  const hits = report.findings.filter((f) => f.ruleId === "runtime-over-autonomy");
  assert.deepEqual(hits, [], "no over-autonomy findings on the safe fixture");
});

test("the ceiling is the runtime's, not a hard-coded string", async () => {
  // Import the runtime directly and confirm the plugin's derived ceiling is the
  // most-permissive level whose route does not execute — i.e. it tracks the
  // runtime's gate, not a copied constant.
  const { AutonomyLevel, ALL_AUTONOMY_LEVELS, routeFor, routeExecutes } =
    await import("octopus-runtime");
  const probe = (l: (typeof ALL_AUTONOMY_LEVELS)[number]) => ({
    requestedAutonomy: l,
    effectiveAutonomy: l,
    requiresApproval: false,
    constraints: [],
    appliedPolicies: [],
  });
  const expectedCeiling = [...ALL_AUTONOMY_LEVELS]
    .reverse()
    .find((l) => !routeExecutes(routeFor(probe(l))));
  assert.equal(expectedCeiling, AutonomyLevel.Draft);

  // And the plugin's message reports exactly that level on the over-autonomy fixture.
  const { plugins } = await loadPlugins(pluginRoot, [PLUGIN_SPEC]);
  const { rules } = mergeRules(builtinRules, plugins);
  const report = await inspect(overAutonomyFixture, { rules });
  const hit = report.findings.find((f) => f.ruleId === "runtime-over-autonomy")!;
  assert.ok(hit.message.includes(`"${expectedCeiling}"`));
});
