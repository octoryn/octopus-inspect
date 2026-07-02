import { test } from "node:test";
import assert from "node:assert/strict";
import { lineColAt, matchGlob, matchesAny, redact, toPosix } from "../src/util.js";

test("toPosix normalizes backslashes", () => {
  assert.equal(toPosix("a\\b\\c"), "a/b/c");
});

test("lineColAt reports 1-based line and column", () => {
  const text = "abc\ndef\nghi";
  assert.deepEqual(lineColAt(text, 0), { line: 1, column: 1 });
  assert.deepEqual(lineColAt(text, 4), { line: 2, column: 1 });
  assert.deepEqual(lineColAt(text, 6), { line: 2, column: 3 });
});

test("redact keeps a few chars and masks the middle", () => {
  assert.equal(redact("short"), "*****");
  const r = redact("AKIA1234567890ABCDEF");
  assert.ok(r.startsWith("AKI"));
  assert.ok(r.endsWith("EF"));
  assert.ok(r.includes("*"));
  assert.ok(!r.includes("1234567890"));
});

test("matchGlob matches bare directory names at any depth", () => {
  assert.ok(matchGlob("node_modules", "node_modules/foo/bar.js"));
  assert.ok(matchGlob("node_modules", "a/node_modules/x.js"));
  assert.ok(!matchGlob("node_modules", "src/index.ts"));
});

test("matchGlob supports * and **", () => {
  assert.ok(matchGlob("*.min.js", "app.min.js"));
  // A slash-less glob matches at any depth (gitignore semantics).
  assert.ok(matchGlob("*.min.js", "src/app.min.js"));
  assert.ok(matchGlob("*.map", "dist/deep/bundle.map"));
  assert.ok(!matchGlob("*.min.js", "app.mints"));
  assert.ok(matchGlob("**/*.map", "dist/deep/app.js.map"));
  assert.ok(matchGlob("src/**", "src/a/b.ts"));
  assert.ok(matchGlob("build", "build/x"));
});

test("matchesAny ORs the patterns", () => {
  assert.ok(matchesAny(["dist", "*.log"], "server.log"));
  assert.ok(!matchesAny(["dist", "*.log"], "src/main.ts"));
});
