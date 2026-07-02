import { test } from "node:test";
import assert from "node:assert/strict";
import { definePlugin, loadPlugins, mergeRules } from "../src/plugin.js";
import { builtinRules } from "../src/rules/index.js";
import type { Rule } from "../src/types.js";
import { cleanup, makeWorkspace } from "./helpers.js";

const extraRule: Rule = {
  id: "extra",
  title: "t",
  description: "d",
  severity: "info",
  check: () => [],
};

test("definePlugin returns its argument", () => {
  const p = definePlugin({ name: "p", rules: [extraRule] });
  assert.equal(p.name, "p");
  assert.equal(p.rules[0], extraRule);
});

test("mergeRules appends plugin rules and rejects id collisions", () => {
  const ok = mergeRules(builtinRules, [{ name: "p", rules: [extraRule] }]);
  assert.equal(ok.errors.length, 0);
  assert.ok(ok.rules.some((r) => r.id === "extra"));

  const collide = mergeRules(builtinRules, [
    { name: "bad", rules: [{ ...extraRule, id: "secret-in-source" }] },
  ]);
  assert.equal(collide.errors.length, 1);
  assert.ok(collide.errors[0]!.includes("collides"));
});

test("loadPlugins imports a valid module and reports invalid ones", async () => {
  const dir = makeWorkspace({
    "good.mjs":
      "export default { name: 'good', rules: [{ id: 'p-rule', title: 't', description: 'd', severity: 'warning', check: () => [] }] };",
    "bad.mjs": "export default { nope: true };",
  });
  try {
    const { plugins, errors } = await loadPlugins(dir, [
      "./good.mjs",
      "./bad.mjs",
      "./missing.mjs",
    ]);
    assert.equal(plugins.length, 1);
    assert.equal(plugins[0]!.name, "good");
    assert.equal(plugins[0]!.rules[0]!.id, "p-rule");
    assert.equal(errors.length, 2); // bad shape + missing file
  } finally {
    cleanup(dir);
  }
});
