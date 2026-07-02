#!/usr/bin/env node
/**
 * octopus-inspect CLI.
 *
 *   octopus-inspect [path]                Inspect a directory (default ".")
 *   octopus-inspect . --format sarif      Emit SARIF for CI code scanning
 *   octopus-inspect . --threshold warning Fail the build on warnings too
 *
 * Exit codes: 0 clean, 1 findings at/above the threshold, 2 configuration error.
 */
import { readFileSync } from "node:fs";
import { inspect, shouldFail } from "./engine.js";
import { loadConfig, normalizeConfig, CONFIG_FILENAME } from "./config.js";
import { parseJsonc, isJsonObject } from "./jsonc.js";
import { builtinRules } from "./rules/index.js";
import { loadPlugins, mergeRules } from "./plugin.js";
import { formatJson, formatPretty, formatSarif, type ReportFormat } from "./report/index.js";
import type { InspectConfig, Severity } from "./types.js";

const USAGE = `octopus-inspect — catch governance holes before production does

Usage:
  octopus-inspect [path]              Inspect a directory or file (default ".")

Options:
  --format <f>      Output format: pretty | json | sarif   (default pretty)
  --config <file>   Config file to use (default ${CONFIG_FILENAME} at the root)
  --threshold <s>   Severity that fails the run: error | warning | info (default error)
  --no-color        Disable ANSI color in pretty output
  --version         Print version and exit
  --help            Show this help

Exit codes: 0 clean, 1 findings at/above threshold, 2 configuration error.`;

interface CliArgs {
  path: string;
  format: ReportFormat;
  config?: string;
  threshold: Severity;
  color: boolean;
  help: boolean;
  version: boolean;
  error?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    path: ".",
    format: "pretty",
    threshold: "error",
    color: true,
    help: false,
    version: false,
  };
  const tokens = [...argv];
  const positional: string[] = [];
  while (tokens.length > 0) {
    const raw = tokens.shift()!;
    let flag = raw;
    let inlineValue: string | undefined;
    const eq = raw.indexOf("=");
    if (raw.startsWith("--") && eq !== -1) {
      flag = raw.slice(0, eq);
      inlineValue = raw.slice(eq + 1);
    }
    const takeValue = (): string | undefined => inlineValue ?? tokens.shift();
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--no-color":
        args.color = false;
        break;
      case "--format":
      case "-f": {
        const v = takeValue();
        if (v !== "pretty" && v !== "json" && v !== "sarif") {
          args.error = `invalid --format "${v ?? ""}" (want pretty|json|sarif)`;
        } else args.format = v;
        break;
      }
      case "--threshold": {
        const v = takeValue();
        if (v !== "error" && v !== "warning" && v !== "info") {
          args.error = `invalid --threshold "${v ?? ""}" (want error|warning|info)`;
        } else args.threshold = v;
        break;
      }
      case "--config": {
        const v = takeValue();
        if (v === undefined) args.error = "--config requires a file path";
        else args.config = v;
        break;
      }
      default:
        if (flag.startsWith("-")) args.error = `unknown option "${flag}"`;
        else positional.push(raw);
    }
  }
  if (positional[0] !== undefined) args.path = positional[0];
  return args;
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function loadExplicitConfig(file: string): InspectConfig {
  const raw = readFileSync(file, "utf8");
  const parsed = parseJsonc(raw);
  if (!isJsonObject(parsed)) throw new Error(`config "${file}" is not a JSON object`);
  return normalizeConfig(parsed);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.error !== undefined) {
    process.stderr.write(`error: ${args.error}\n\n${USAGE}\n`);
    return 2;
  }

  let config: InspectConfig;
  try {
    config = args.config !== undefined ? loadExplicitConfig(args.config) : loadConfig(args.path);
  } catch (cause) {
    process.stderr.write(`error: ${(cause as Error).message}\n`);
    return 2;
  }

  const { plugins, errors: loadErrors } = await loadPlugins(args.path, config.plugins ?? []);
  const { rules, errors: mergeErrors } = mergeRules(builtinRules, plugins);
  const configErrors = [...loadErrors, ...mergeErrors];
  for (const e of configErrors) process.stderr.write(`error: ${e}\n`);

  let report;
  try {
    report = await inspect(args.path, { config, rules });
  } catch (cause) {
    process.stderr.write(`error: ${(cause as Error).message}\n`);
    return 2;
  }

  switch (args.format) {
    case "json":
      process.stdout.write(`${formatJson(report)}\n`);
      break;
    case "sarif":
      process.stdout.write(`${formatSarif(report, { rules, version: readVersion() })}\n`);
      break;
    case "pretty":
      process.stdout.write(
        `${formatPretty(report, { color: args.color && process.stdout.isTTY === true })}\n`,
      );
      break;
  }

  if (configErrors.length > 0) return 2;
  return shouldFail(report, args.threshold) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`fatal: ${(err as Error).message}\n`);
    process.exit(2);
  },
);
