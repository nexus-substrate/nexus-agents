/**
 * Security enforcement-point gate (#5041).
 *
 * Verifies that each security-relevant control registered in the curated
 * manifest has at least one active, non-test, non-barrel production call site
 * within `packages/nexus-agents/src/`.
 *
 * ## Why this gate exists
 *
 * Issue #5041 surfaced four security controls that were fully implemented,
 * exported on barrels, tested by unit tests, and never called on any live
 * production path (e.g. `AuthHandler.authenticate` had unit tests in
 * `auth-handler.test.ts` and was advertised in `SECURITY.md`, but had zero
 * non-test call sites in the repository).
 *
 * Generic unused-export checks (`knip`, `check-new-unused-exports.ts`) cannot
 * catch this class because:
 * - knip sees tests and barrel re-exports as live usages of the export;
 * - `check-new-unused-exports.ts` only monitors new files added in a PR, not
 *   pre-existing exports whose production consumers were removed or never landed.
 *
 * ## Design constraint: Fail closed on empty collections
 *
 * Per `.rules/development-disciplines.md` ("Name the empty case"):
 * A gate that reports success because it had nothing to check is worse than
 * no gate. This gate asserts:
 * 1. The manifest is non-empty (`entries.length > 0`);
 * 2. If `expectedCount` is declared, the manifest matches it exactly;
 * 3. Scanned production files are non-empty (`files.length > 0`);
 * 4. Every declared control has at least one non-test, non-barrel call site
 *    outside its own defining file.
 *
 * An empty manifest or zero scanned files produces a failure verdict and exit code 1.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-security-enforcement-points.ts [--verbose]
 *
 * @module scripts/check-security-enforcement-points
 * (Source: Issue #5041)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_ROOT } from './script-paths.js';
import { stripComments } from './check-env-schema-coverage.js';

/** One registered security control and its required enforcement symbol. */
export interface SecurityEnforcementEntry {
  /** Unique identifier for this security control. */
  readonly id: string;
  /** Description of what security property this control enforces. */
  readonly description: string;
  /** The symbol whose invocation constitutes enforcement. */
  readonly symbol: string;
  /** The file where the symbol is defined (excluded from counting as its own caller). */
  readonly sourceFile: string;
  /** Optional custom regex pattern matching invocation sites. */
  readonly callPattern?: RegExp;
}

/** One detected call site for a security control. */
export interface CallSite {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Result of checking one security control. */
export interface EnforcementPointResult {
  readonly controlId: string;
  readonly symbol: string;
  readonly sourceFile: string;
  readonly callSites: readonly CallSite[];
  readonly ok: boolean;
}

/** Overall gate evaluation result. */
export interface SecurityEnforcementGateResult {
  readonly ok: boolean;
  readonly totalControls: number;
  readonly evaluatedControls: number;
  readonly scannedFilesCount: number;
  readonly passed: readonly EnforcementPointResult[];
  readonly failed: readonly EnforcementPointResult[];
  readonly errors: readonly string[];
}

/** Options for running the enforcement-point check. */
export interface SecurityEnforcementCheckOptions {
  /** Manifest entries to check. Defaults to `DEFAULT_SECURITY_MANIFEST`. */
  readonly manifest?: readonly SecurityEnforcementEntry[];
  /** Optional expected count to verify against manifest length. */
  readonly expectedCount?: number;
  /** Source files to scan. If omitted, recursively scans `SRC_ROOT`. */
  readonly sourceFiles?: readonly string[];
  /** Function to read file content. Defaults to `readFileSync(..., 'utf-8')`. */
  readonly readFile?: (filePath: string) => string;
  /** Whether to log verbose diagnostics. */
  readonly verbose?: boolean;
}

/**
 * Curated manifest of security controls that must have at least one active,
 * non-test production enforcement call site in packages/nexus-agents/src/.
 */
export const DEFAULT_SECURITY_MANIFEST: readonly SecurityEnforcementEntry[] = [
  {
    id: 'path-containment-is-path-safe',
    description: 'Path containment validation against allowed path prefixes in PolicyFirewall',
    symbol: 'isPathSafe',
    sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-helpers.ts',
  },
  {
    id: 'path-containment-resolve-inside-root',
    description: 'Symlink-aware path traversal containment verification against workspace root',
    symbol: 'resolveInsideRoot',
    sourceFile: 'packages/nexus-agents/src/security/safe-path.ts',
  },
  {
    id: 'policy-firewall-verdict-audit',
    description: 'Audit emission for policy firewall decisions (deny and warn-mode near-misses)',
    symbol: 'recordPolicyVerdict',
    sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-audit-emit.ts',
  },
  {
    id: 'mcp-policy-check',
    description: 'Process-wide PolicyFirewall evaluation on MCP tool execution dispatch',
    symbol: 'runPolicyCheck',
    sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-check.ts',
  },
  {
    id: 'input-sanitizer',
    description: 'Untrusted input sanitization against prompt injection and instruction tags',
    symbol: 'sanitizeInput',
    sourceFile: 'packages/nexus-agents/src/security/input-sanitizer.ts',
  },
  {
    id: 'output-sanitizer',
    description: 'Output redaction for sensitive credentials and API tokens',
    symbol: 'sanitizeOutput',
    sourceFile: 'packages/nexus-agents/src/security/output-sanitizer.ts',
  },
  {
    id: 'sandbox-command-validation',
    description: 'Command execution validation against strict category allowlists',
    symbol: 'validateCommand',
    sourceFile: 'packages/nexus-agents/src/security/sandbox/command-allowlist.ts',
  },
  {
    id: 'sandbox-env-sanitization',
    description: 'Environment variable filtering and boundary isolation for subprocess sandboxes',
    symbol: 'sanitizeEnvironment',
    sourceFile: 'packages/nexus-agents/src/security/sandbox/env-sanitizer.ts',
  },
  {
    id: 'security-durable-audit',
    description: 'Bridge mapping in-memory security audit events to durable tamper-evident log',
    symbol: 'createDurableAuditTrail',
    sourceFile: 'packages/nexus-agents/src/security/audit-bridge.ts',
  },
  {
    id: 'policy-firewall-stage-rollout',
    description: 'Stages registered firewall to warn/enforce mode during tool startup',
    symbol: 'stagePolicyFirewallForRollout',
    sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-registry.ts',
  },
];

/** True for test files (unit tests, integration tests, specs, test helpers). */
export function isTestFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return (
    /\.(test|spec)\.tsx?$/.test(normalized) ||
    normalized.includes('/__tests__/') ||
    normalized.includes('/src/testing/')
  );
}

/** True for barrel files (index.ts and exports/ re-export barrels). */
export function isBarrelFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return /\/index\.tsx?$/.test(normalized) || normalized.includes('/src/exports/');
}

/** True for declaration files (.d.ts). */
export function isDeclarationFile(file: string): boolean {
  return file.endsWith('.d.ts');
}

/** True for production files eligible for enforcement site checks. */
export function isProductionSourceFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/');
  return (
    /\.tsx?$/.test(normalized) &&
    !isDeclarationFile(normalized) &&
    !isTestFile(normalized) &&
    !isBarrelFile(normalized)
  );
}

/** Check if two file paths resolve to the same underlying file. */
export function pathsMatch(pathA: string, pathB: string): boolean {
  const a = pathA.replace(/\\/g, '/').replace(/^\.?\//, '');
  const b = pathB.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (a === b) return true;
  return a.endsWith('/' + b) || b.endsWith('/' + a);
}

/** Recursively collect all .ts / .tsx files under dir. */
export function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        files.push(...collectSourceFiles(full));
      } else if (st.isFile() && /\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  } catch {
    // Unreadable directory returns empty
  }
  return files;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the invocation regex for a symbol.
 * Matches `symbol(` or `.symbol(` with optional whitespace before `(`.
 */
function buildCallPattern(symbol: string, custom?: RegExp): RegExp {
  if (custom !== undefined) {
    return custom;
  }
  return new RegExp(`(?:\\b|\\.)${escapeRegex(symbol)}\\s*\\(`);
}

/** Validate manifest entries and source file prerequisites. */
function validatePrerequisites(
  manifest: readonly SecurityEnforcementEntry[],
  productionFiles: readonly string[],
  totalAllFiles: number,
  expectedCount?: number
): readonly string[] {
  const errors: string[] = [];

  if (manifest.length === 0) {
    errors.push('Empty security enforcement manifest: expected at least 1 entry.');
  }

  if (expectedCount !== undefined && manifest.length !== expectedCount) {
    errors.push(
      `Manifest entry count (${String(manifest.length)}) does not match expectedCount (${String(expectedCount)}).`
    );
  }

  const seenIds = new Set<string>();
  for (const entry of manifest) {
    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate control ID in manifest: '${entry.id}'.`);
    }
    seenIds.add(entry.id);
  }

  if (productionFiles.length === 0) {
    errors.push(
      `Zero source files scanned under packages/nexus-agents/src (total files found: ${String(totalAllFiles)}).`
    );
  }

  return errors;
}

/** Read file contents and strip comments for comment-free call analysis. */
function readStrippedContents(
  files: readonly string[],
  readFileFn: (p: string) => string
): ReadonlyMap<string, string> {
  const contents = new Map<string, string>();
  for (const file of files) {
    try {
      contents.set(file, stripComments(readFileFn(file)));
    } catch {
      contents.set(file, '');
    }
  }
  return contents;
}

/** Scan a single stripped file for call sites of pattern. */
function findCallSitesInFile(file: string, stripped: string, pattern: RegExp): readonly CallSite[] {
  if (!pattern.test(stripped)) {
    return [];
  }
  const sites: CallSite[] = [];
  const lines = stripped.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && pattern.test(line)) {
      sites.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return sites;
}

/** Evaluate one security control across all production source files. */
function evaluateControl(
  control: SecurityEnforcementEntry,
  productionFiles: readonly string[],
  fileContents: ReadonlyMap<string, string>
): EnforcementPointResult {
  const pattern = buildCallPattern(control.symbol, control.callPattern);
  const callSites: CallSite[] = [];

  for (const file of productionFiles) {
    if (pathsMatch(file, control.sourceFile)) {
      continue;
    }
    const stripped = fileContents.get(file);
    if (stripped === undefined) {
      continue;
    }
    const sites = findCallSitesInFile(file, stripped, pattern);
    if (sites.length > 0) {
      callSites.push(...sites);
    }
  }

  return {
    controlId: control.id,
    symbol: control.symbol,
    sourceFile: control.sourceFile,
    callSites,
    ok: callSites.length > 0,
  };
}

/** Evaluate all manifest controls against production files. */
function evaluateAllControls(
  manifest: readonly SecurityEnforcementEntry[],
  productionFiles: readonly string[],
  fileContents: ReadonlyMap<string, string>
): { passed: readonly EnforcementPointResult[]; failed: readonly EnforcementPointResult[] } {
  const passed: EnforcementPointResult[] = [];
  const failed: EnforcementPointResult[] = [];

  for (const control of manifest) {
    const result = evaluateControl(control, productionFiles, fileContents);
    if (result.ok) {
      passed.push(result);
    } else {
      failed.push(result);
    }
  }

  return { passed, failed };
}

/**
 * Check security enforcement points against source files.
 * Fails closed if the manifest is empty or zero files are scanned.
 */
export function checkSecurityEnforcementPoints(
  options: SecurityEnforcementCheckOptions = {}
): SecurityEnforcementGateResult {
  const manifest = options.manifest ?? DEFAULT_SECURITY_MANIFEST;
  const readFileFn = options.readFile ?? ((p: string) => readFileSync(p, 'utf-8'));
  const allFiles = options.sourceFiles ?? collectSourceFiles(SRC_ROOT);
  const productionFiles = allFiles.filter(isProductionSourceFile);

  const errors = validatePrerequisites(
    manifest,
    productionFiles,
    allFiles.length,
    options.expectedCount
  );

  if (errors.length > 0) {
    return {
      ok: false,
      totalControls: manifest.length,
      evaluatedControls: 0,
      scannedFilesCount: productionFiles.length,
      passed: [],
      failed: [],
      errors,
    };
  }

  const fileContents = readStrippedContents(productionFiles, readFileFn);
  const { passed, failed } = evaluateAllControls(manifest, productionFiles, fileContents);
  const ok = failed.length === 0 && passed.length === manifest.length;

  return {
    ok,
    totalControls: manifest.length,
    evaluatedControls: manifest.length,
    scannedFilesCount: productionFiles.length,
    passed,
    failed,
    errors: [],
  };
}

/** Print verbose output for passing controls. */
function printVerboseDetails(passed: readonly EnforcementPointResult[]): void {
  for (const p of passed) {
    console.log(`  ✓ [${p.controlId}]: ${String(p.callSites.length)} call site(s) found:`);
    for (const site of p.callSites.slice(0, 3)) {
      console.log(`      - ${site.file}:${String(site.line)}: ${site.text}`);
    }
    if (p.callSites.length > 3) {
      console.log(`      ... and ${String(p.callSites.length - 3)} more`);
    }
  }
}

/** CLI entry point. */
export function main(): number {
  const verbose = process.argv.includes('--verbose');
  const result = checkSecurityEnforcementPoints({ verbose });

  if (result.errors.length > 0) {
    console.error('Security enforcement gate error:');
    for (const err of result.errors) {
      console.error(`  ✗ ${err}`);
    }
    return 1;
  }

  if (!result.ok || result.failed.length > 0) {
    console.error(
      `Security enforcement gate FAILED: ${String(result.failed.length)} of ${String(result.totalControls)} control(s) have NO production callers.`
    );
    for (const f of result.failed) {
      console.error(
        `  ✗ [${f.controlId}]: symbol '${f.symbol}' (declared in ${f.sourceFile}) has 0 non-test production call sites!`
      );
    }
    return 1;
  }

  console.log(
    `Security enforcement points: ${String(result.passed.length)} of ${String(result.totalControls)} controls verified active across ${String(result.scannedFilesCount)} production source files.`
  );

  if (verbose) {
    printVerboseDetails(result.passed);
  }

  return 0;
}

// CLI entry guard
if (process.argv[1]?.endsWith('check-security-enforcement-points.ts') === true) {
  process.exit(main());
}
