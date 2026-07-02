/** Build a {@link Workspace} by walking a directory on disk. */
import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import type { Workspace, WorkspaceFile } from "./types.js";
import { matchesAny, toPosix } from "./util.js";

/** Directories and files never worth linting; always applied. */
export const DEFAULT_IGNORES: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  "vendor",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "*.min.js",
  "*.map",
  ".DS_Store",
];

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024; // 1 MiB

export interface BuildWorkspaceOptions {
  readonly ignore?: readonly string[];
  readonly maxFileBytes?: number;
}

/** Read a directory tree into a Workspace, applying ignore globs. */
export function buildWorkspace(root: string, options: BuildWorkspaceOptions = {}): Workspace {
  const ignore = [...DEFAULT_IGNORES, ...(options.ignore ?? [])];
  const maxBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const stat = statSync(root); // throws a clear error if the path is missing

  const files: WorkspaceFile[] = [];
  if (stat.isDirectory()) {
    walk(root, root, ignore, maxBytes, files);
  } else if (stat.isFile()) {
    // A single-file target is a one-file workspace rooted at its directory.
    const dir = dirname(root);
    const file = makeFile(root, toPosix(relative(dir, root)), maxBytes);
    if (file) files.push(file);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    root,
    files,
    filesByExt(...exts: string[]): readonly WorkspaceFile[] {
      const wanted = new Set(exts.map((e) => e.toLowerCase()));
      return files.filter((f) => !f.binary && wanted.has(f.ext));
    },
  };
}

function walk(
  absRoot: string,
  dir: string,
  ignore: readonly string[],
  maxBytes: number,
  out: WorkspaceFile[],
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory — skip rather than crash the whole run
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = toPosix(relative(absRoot, abs));
    if (rel === "" || matchesAny(ignore, rel)) continue;
    if (entry.isSymbolicLink()) continue; // don't follow symlinks (loops, escapes)
    if (entry.isDirectory()) {
      walk(absRoot, abs, ignore, maxBytes, out);
    } else if (entry.isFile()) {
      const file = makeFile(abs, rel, maxBytes);
      if (file) out.push(file);
    }
  }
}

function makeFile(absPath: string, relPath: string, maxBytes: number): WorkspaceFile | undefined {
  let size: number;
  try {
    size = statSync(absPath).size;
  } catch {
    return undefined;
  }
  if (size > maxBytes) return undefined;

  let cachedText: string | undefined;
  let cachedLines: readonly string[] | undefined;
  let binary: boolean | undefined;

  const ensureRead = (): void => {
    if (cachedText !== undefined) return;
    let buf: Buffer;
    try {
      buf = readFileSync(absPath);
    } catch {
      cachedText = "";
      binary = false;
      return;
    }
    binary = looksBinary(buf);
    cachedText = binary ? "" : buf.toString("utf8");
  };

  return {
    path: relPath,
    absPath,
    ext: extname(relPath).toLowerCase(),
    get binary(): boolean {
      ensureRead();
      return binary ?? false;
    },
    text(): string {
      ensureRead();
      return cachedText ?? "";
    },
    lines(): readonly string[] {
      if (cachedLines === undefined) {
        cachedLines = this.text().split("\n");
      }
      return cachedLines;
    },
  };
}

/** A file is treated as binary if a NUL byte appears near the start. */
function looksBinary(buf: Uint8Array): boolean {
  const limit = Math.min(buf.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
