/** Small dependency-free helpers shared by the engine and rules. */

/** Convert a native path to POSIX separators (stable across platforms). */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 1-based line and column for a character offset in `text`. */
export function lineColAt(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

/**
 * Redact a secret-looking string for safe display in a report: keep a few
 * leading/trailing characters, mask the middle. Short strings are fully masked.
 */
export function redact(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return "*".repeat(s.length);
  return `${s.slice(0, 3)}${"*".repeat(Math.min(8, s.length - 5))}${s.slice(-2)}`;
}

/**
 * Minimal glob matcher supporting `*` (within a segment) and `**` (across
 * segments). Following gitignore semantics, a pattern with no `/` matches at any
 * depth: a bare token (`node_modules`) matches any path *segment*, and a
 * slash-less glob (`*.min.js`) matches any *basename*. A pattern containing `/`
 * is anchored to the workspace-relative path (and also matches everything
 * beneath a directory it names). Matching is against a POSIX path.
 */
export function matchGlob(pattern: string, relPath: string): boolean {
  const pat = pattern.trim();
  if (pat.length === 0) return false;

  // No slash: match at any depth (gitignore-style).
  if (!pat.includes("/")) {
    const segments = relPath.split("/");
    if (!pat.includes("*") && !pat.includes("?")) {
      // Bare token: matches any segment (so a directory name ignores its tree).
      return segments.includes(pat);
    }
    // Slash-less glob: match the file's basename.
    const base = segments[segments.length - 1] ?? relPath;
    return globToRegExp(pat).test(base);
  }

  const normalized = pat.replace(/^\.\//, "").replace(/\/$/, "");
  const re = globToRegExp(normalized);
  if (re.test(relPath)) return true;
  // A directory pattern also matches everything beneath it.
  return new RegExp(`^${globToRegExpSource(normalized)}/`).test(relPath);
}

function globToRegExpSource(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++; // consume the second `*`
        if (glob[i + 1] === "/") {
          // `**/` — zero or more leading path segments.
          i++;
          out += "(?:.*/)?";
        } else {
          // trailing `**` — anything, including path separators.
          out += ".*";
        }
      } else {
        // `*` — any run of non-separator characters.
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return out;
}

function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${globToRegExpSource(glob)}$`);
}

/** Does `path` match any of the given glob patterns? */
export function matchesAny(patterns: readonly string[], relPath: string): boolean {
  for (const p of patterns) {
    if (matchGlob(p, relPath)) return true;
  }
  return false;
}
