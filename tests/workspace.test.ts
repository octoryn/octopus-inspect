import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildWorkspace } from "../src/workspace.js";
import { cleanup, makeWorkspace } from "./helpers.js";

test("buildWorkspace lists files with POSIX paths, sorted", () => {
  const dir = makeWorkspace({ "b.ts": "1", "a/c.ts": "2", "a/b.ts": "3" });
  try {
    const ws = buildWorkspace(dir);
    assert.deepEqual(
      ws.files.map((f) => f.path),
      ["a/b.ts", "a/c.ts", "b.ts"],
    );
  } finally {
    cleanup(dir);
  }
});

test("buildWorkspace applies default and custom ignores", () => {
  const dir = makeWorkspace({
    "src/app.ts": "x",
    "node_modules/dep/index.js": "y",
    "dist/out.js": "z",
    "secret.env": "TOKEN=1",
  });
  try {
    const ws = buildWorkspace(dir, { ignore: ["*.env"] });
    const paths = ws.files.map((f) => f.path);
    assert.deepEqual(paths, ["src/app.ts"]);
  } finally {
    cleanup(dir);
  }
});

test("filesByExt returns only non-binary files of the given extensions", () => {
  const dir = makeWorkspace({ "a.json": "{}", "b.ts": "x", "c.md": "# hi" });
  try {
    const ws = buildWorkspace(dir);
    assert.deepEqual(
      ws.filesByExt(".json", ".md").map((f) => f.path),
      ["a.json", "c.md"],
    );
  } finally {
    cleanup(dir);
  }
});

test("binary files are detected and excluded from filesByExt", () => {
  const dir = makeWorkspace({ "logo.png": "PNG\u0000\u0000bin" });
  try {
    const ws = buildWorkspace(dir);
    const png = ws.files.find((f) => f.path === "logo.png");
    assert.ok(png);
    assert.equal(png!.binary, true);
    assert.equal(png!.text(), "");
  } finally {
    cleanup(dir);
  }
});

test("a single-file target becomes a one-file workspace", () => {
  const dir = makeWorkspace({ "only.json": '{"a":1}' });
  try {
    const ws = buildWorkspace(join(dir, "only.json"));
    assert.equal(ws.files.length, 1);
    assert.equal(ws.files[0]!.path, "only.json");
  } finally {
    cleanup(dir);
  }
});

test("files larger than maxFileBytes are skipped", () => {
  const dir = makeWorkspace({ "big.txt": "x".repeat(1000), "small.txt": "hi" });
  try {
    const ws = buildWorkspace(dir, { maxFileBytes: 100 });
    assert.deepEqual(
      ws.files.map((f) => f.path),
      ["small.txt"],
    );
  } finally {
    cleanup(dir);
  }
});
