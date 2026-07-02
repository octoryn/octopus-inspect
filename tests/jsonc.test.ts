import { test } from "node:test";
import assert from "node:assert/strict";
import { findKeyLine, isJsonObject, parseJsonc, walkJson, type JsonValue } from "../src/jsonc.js";

test("parseJsonc strips line and block comments", () => {
  const v = parseJsonc(`{
    // a comment
    "a": 1, /* inline */ "b": 2
  }`);
  assert.deepEqual(v, { a: 1, b: 2 });
});

test("parseJsonc tolerates trailing commas", () => {
  assert.deepEqual(parseJsonc(`{ "a": [1, 2,], }`), { a: [1, 2] });
});

test("parseJsonc keeps comment-like content inside strings", () => {
  assert.deepEqual(parseJsonc(`{ "url": "https://x.y/z" }`), { url: "https://x.y/z" });
});

test("parseJsonc returns undefined on genuine syntax errors", () => {
  assert.equal(parseJsonc(`{ not json `), undefined);
});

test("parseJsonc does not corrupt commas inside string values", () => {
  // A ',]' or ',}' inside a string must survive trailing-comma stripping.
  assert.deepEqual(parseJsonc('{"cmd":"rm -rf a,]"}'), { cmd: "rm -rf a,]" });
  assert.deepEqual(parseJsonc('{"note":"x,} y"}'), { note: "x,} y" });
  assert.deepEqual(parseJsonc('{"perms":["read","items,]",]}'), { perms: ["read", "items,]"] });
});

test("walkJson visits every node with its path", () => {
  const root: JsonValue = { a: { b: [1, 2] } };
  const paths: string[] = [];
  walkJson(root, (n) => paths.push(n.path.join(".")));
  assert.ok(paths.includes(""));
  assert.ok(paths.includes("a"));
  assert.ok(paths.includes("a.b"));
  assert.ok(paths.includes("a.b.0"));
  assert.ok(paths.includes("a.b.1"));
});

test("isJsonObject distinguishes objects from arrays and null", () => {
  assert.ok(isJsonObject({}));
  assert.ok(!isJsonObject([]));
  assert.ok(!isJsonObject(null));
  assert.ok(!isJsonObject("s"));
});

test("findKeyLine returns the first 1-based line holding a key", () => {
  const lines = ["{", '  "foo": 1,', '  "bar": 2', "}"];
  assert.equal(findKeyLine(lines, "bar"), 3);
  assert.equal(findKeyLine(lines, "missing"), undefined);
});
