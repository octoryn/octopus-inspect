/**
 * Tolerant JSON handling for the structural rules.
 *
 * Agent/workspace config is frequently JSON with comments and trailing commas
 * (`.mcp.json`, editor configs, etc.). We strip those and parse, returning
 * `undefined` on genuine syntax errors so a structural rule can simply skip a
 * file it cannot understand (the text rules still run over it).
 *
 * JSON.parse discards source positions, so line numbers are recovered
 * best-effort by locating a key token in the raw text. That is good enough for
 * a linter pointer; it never affects whether a finding is produced.
 */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Strip `//` and `/* *\/` comments and trailing commas, then JSON.parse. */
export function parseJsonc(text: string): JsonValue | undefined {
  const stripped = stripTrailingCommas(stripJsonComments(text));
  try {
    return JSON.parse(stripped) as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Remove trailing commas (a `,` whose next non-whitespace char is `}` or `]`)
 * while tracking string state, so a comma *inside* a string value — e.g.
 * `"rm -rf a,]"` — is never touched. A naive global regex would corrupt such
 * values silently.
 */
function stripTrailingCommas(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (j < text.length && (text[j] === "}" || text[j] === "]")) continue; // drop trailing comma
    }
    out += c;
  }
  return out;
}

/** Remove comments while preserving them inside strings (and string length). */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++; // land on the '/'
      out += " ";
      continue;
    }
    out += c;
  }
  return out;
}

export function isJsonObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A visited node: its value and the path of keys/indices that reached it. */
export interface JsonNode {
  readonly value: JsonValue;
  readonly path: readonly (string | number)[];
  /** The key this node sits under (last path segment), if any. */
  readonly key: string | number | undefined;
}

/** Depth-first walk over every node (objects, arrays, and scalars). */
export function walkJson(root: JsonValue, visit: (node: JsonNode) => void): void {
  const stack: JsonNode[] = [{ value: root, path: [], key: undefined }];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visit(node);
    const v = node.value;
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ value: v[i]!, path: [...node.path, i], key: i });
      }
    } else if (isJsonObject(v)) {
      const keys = Object.keys(v);
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i]!;
        stack.push({ value: v[k]!, path: [...node.path, k], key: k });
      }
    }
  }
}

/** Best-effort 1-based line of the first occurrence of `"key"` in `lines`. */
export function findKeyLine(lines: readonly string[], key: string): number | undefined {
  const needle = `"${key}"`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return undefined;
}
