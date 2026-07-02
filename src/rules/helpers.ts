/** Shared helpers for built-in rules. */
import type { Workspace, WorkspaceFile } from "../types.js";
import type { JsonValue } from "../jsonc.js";
import { parseJsonc } from "../jsonc.js";

// Re-exported so rules import their JSON helpers from one place.
export { findKeyLine } from "../jsonc.js";

/** A JSON/JSONC file that parsed successfully, with its raw lines for line lookup. */
export interface ParsedJsonFile {
  readonly file: WorkspaceFile;
  readonly root: JsonValue;
  readonly lines: readonly string[];
}

const JSON_EXTS = new Set([".json", ".jsonc", ".mcp"]);

/**
 * Every non-binary JSON/JSONC file in the workspace that parses. Files that
 * fail to parse are skipped (text rules still see them). `.mcp.json` matches on
 * the compound suffix as well as the `.json` extension.
 */
export function parsedJsonFiles(workspace: Workspace): ParsedJsonFile[] {
  const out: ParsedJsonFile[] = [];
  for (const file of workspace.files) {
    if (file.binary) continue;
    if (!JSON_EXTS.has(file.ext) && !file.path.endsWith(".json")) continue;
    const root = parseJsonc(file.text());
    if (root === undefined) continue;
    out.push({ file, root, lines: file.lines() });
  }
  return out;
}

/** Case-insensitive test that a key name matches any of the given fragments. */
export function keyMatches(key: string | number | undefined, ...fragments: string[]): boolean {
  if (typeof key !== "string") return false;
  const lower = key.toLowerCase();
  return fragments.some((f) => lower.includes(f));
}

/** Coerce a JSON value to a display string for excerpts. */
export function shortValue(value: JsonValue): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "object") return Array.isArray(value) ? "[…]" : "{…}";
  return String(value);
}
