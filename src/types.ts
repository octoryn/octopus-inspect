/**
 * Core contracts for octopus-inspect.
 *
 * The whole tool is a *rule host*: an engine that walks a workspace and runs
 * governance {@link Rule}s over it, producing deterministic {@link Finding}s.
 * Built-in rules are all **static and self-contained** — they never import a
 * runtime or reproduce another system's semantics. Checks that need to
 * understand a specific runtime's policy model belong in a {@link Plugin}
 * contributed by that runtime, so there is only ever one source of truth for
 * what "safe" means.
 */

/** Severity of a finding. `error` fails the run by default. */
export type Severity = "error" | "warning" | "info";

export const SEVERITIES: readonly Severity[] = ["error", "warning", "info"];

/** A single governance issue found in the workspace. */
export interface Finding {
  /** Id of the rule that produced this finding, e.g. `"secret-in-source"`. */
  readonly ruleId: string;
  /** Effective severity after config overrides. */
  readonly severity: Severity;
  /** Human-readable, single-line description of what is wrong. */
  readonly message: string;
  /** Workspace-relative path (POSIX separators). */
  readonly file: string;
  /** 1-based line, when the rule can localize the issue. */
  readonly line?: number;
  /** 1-based column, when known. */
  readonly column?: number;
  /** A short, redacted snippet of the offending content. */
  readonly excerpt?: string;
  /** A concrete suggested fix, when the rule can offer one. */
  readonly suggestion?: string;
}

/**
 * What a rule returns. The engine attaches `ruleId` and resolves the effective
 * `severity` (rule default, unless the finding or config overrides it), so a
 * rule only describes *where* and *what*.
 */
export interface RawFinding {
  readonly message: string;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly excerpt?: string;
  readonly suggestion?: string;
  /** Rare per-finding severity override (e.g. a rule that grades by pattern). */
  readonly severity?: Severity;
}

/** A single file exposed to rules, with cached, lazy content access. */
export interface WorkspaceFile {
  /** Workspace-relative path, POSIX separators (stable across platforms). */
  readonly path: string;
  /** Absolute path on disk. */
  readonly absPath: string;
  /** Lowercased extension including the dot, e.g. `".ts"` (`""` if none). */
  readonly ext: string;
  /** Whether the file looked like binary (rules generally skip these). */
  readonly binary: boolean;
  /** UTF-8 contents, read once and cached. Empty string for binary files. */
  text(): string;
  /** `text()` split into lines, cached. */
  lines(): readonly string[];
}

/** The scanned file set handed to every rule. */
export interface Workspace {
  /** Absolute workspace root. */
  readonly root: string;
  /** All non-ignored files, sorted by path. */
  readonly files: readonly WorkspaceFile[];
  /** Non-binary files whose extension matches one of `exts` (dot-prefixed). */
  filesByExt(...exts: string[]): readonly WorkspaceFile[];
}

/** A governance rule. Pure and deterministic: same workspace → same findings. */
export interface Rule {
  /** Stable kebab-case id, unique across all registered rules. */
  readonly id: string;
  /** One-line title shown in help and reports. */
  readonly title: string;
  /** What the rule checks and why it matters. */
  readonly description: string;
  /** Default severity, overridable per-workspace via config. */
  readonly severity: Severity;
  /** Inspect the workspace and return raw findings (no ruleId/severity). */
  check(workspace: Workspace): RawFinding[] | Promise<RawFinding[]>;
}

/** A bundle of extra rules, typically contributed by a runtime it understands. */
export interface Plugin {
  readonly name: string;
  readonly rules: readonly Rule[];
}

/** Per-rule configuration: turn it off, or override its severity. */
export type RuleSetting = "off" | Severity;

/** Workspace configuration, typically from `.octoinspect.json`. */
export interface InspectConfig {
  /** Extra ignore globs (added to the built-in defaults). Supports `*`/`**`. */
  readonly ignore?: readonly string[];
  /** Rule id → setting. Unlisted rules keep their default severity. */
  readonly rules?: Readonly<Record<string, RuleSetting>>;
  /** Module specifiers to load as {@link Plugin}s (resolved from the root). */
  readonly plugins?: readonly string[];
  /** Skip files larger than this many bytes (default 1 MiB). */
  readonly maxFileBytes?: number;
}

/** The result of a run. */
export interface InspectReport {
  readonly root: string;
  /** Findings, deterministically sorted. */
  readonly findings: readonly Finding[];
  /** Number of files scanned. */
  readonly fileCount: number;
  /** Number of rules run. */
  readonly ruleCount: number;
  /** Counts by severity. */
  readonly summary: Readonly<Record<Severity, number>>;
}
