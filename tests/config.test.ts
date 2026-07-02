import { test } from "node:test";
import assert from "node:assert/strict";
import { isRuleEnabled, loadConfig, normalizeConfig, resolveSeverity } from "../src/config.js";
import { cleanup, makeWorkspace } from "./helpers.js";

test("loadConfig reads .octoinspect.json from the root", () => {
  const dir = makeWorkspace({
    ".octoinspect.json": JSON.stringify({
      rules: { "secret-in-source": "off" },
      ignore: ["fixtures"],
    }),
  });
  try {
    const config = loadConfig(dir);
    assert.deepEqual(config.ignore, ["fixtures"]);
    assert.equal(config.rules?.["secret-in-source"], "off");
  } finally {
    cleanup(dir);
  }
});

test("loadConfig returns empty config when absent or malformed", () => {
  const dir = makeWorkspace({ ".octoinspect.json": "{ broken" });
  try {
    assert.deepEqual(loadConfig(dir), {});
  } finally {
    cleanup(dir);
  }
});

test("normalizeConfig drops invalid rule settings and non-strings", () => {
  const config = normalizeConfig({
    ignore: ["a", 5, "b"],
    plugins: ["./p.js", 3],
    maxFileBytes: 2048,
    rules: { good: "warning", off: "off", bogus: "loud", n: 4 },
  });
  assert.deepEqual(config.ignore, ["a", "b"]);
  assert.deepEqual(config.plugins, ["./p.js"]);
  assert.equal(config.maxFileBytes, 2048);
  assert.deepEqual(config.rules, { good: "warning", off: "off" });
});

test("normalizeConfig rejects a non-positive maxFileBytes", () => {
  // A 0/negative limit would skip every file and fake a clean run.
  assert.equal(normalizeConfig({ maxFileBytes: 0 }).maxFileBytes, undefined);
  assert.equal(normalizeConfig({ maxFileBytes: -1 }).maxFileBytes, undefined);
  assert.equal(normalizeConfig({ maxFileBytes: 1024 }).maxFileBytes, 1024);
});

test("isRuleEnabled treats unlisted rules as enabled and 'off' as disabled", () => {
  assert.ok(isRuleEnabled("x", {}));
  assert.ok(isRuleEnabled("x", { rules: { x: "error" } }));
  assert.ok(!isRuleEnabled("x", { rules: { x: "off" } }));
});

test("resolveSeverity: config override > finding severity > rule default", () => {
  assert.equal(resolveSeverity("r", "error", undefined, {}), "error");
  assert.equal(resolveSeverity("r", "error", "info", {}), "info");
  assert.equal(resolveSeverity("r", "error", "info", { rules: { r: "warning" } }), "warning");
});
