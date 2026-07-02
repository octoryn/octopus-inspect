/** Test helpers: build a throwaway workspace directory from a file map. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Create a temp directory populated with the given `relpath → content` files. */
export function makeWorkspace(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "octoinspect-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

/** Recursively remove a temp workspace. */
export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
