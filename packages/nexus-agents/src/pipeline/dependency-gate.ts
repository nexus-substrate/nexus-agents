/** Dependency checks for manifests selected from the pipeline capture scope. */
import { join, resolve } from 'node:path';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { createLogger } from '../core/index.js';
import { queryOsvBatch, type OsvVulnerability } from '../security/osv-lookup.js';
import { throwIfAborted } from '../adapters/abort-utils.js';
import { changedPackageManifests } from './dev-pipeline-capture-scope.js';
import type { SecurityGateConfig } from './security-gate.js';

const logger = createLogger({ component: 'dependency-gate' });
const MANIFEST_SCHEMA = z.object({ dependencies: z.record(z.string(), z.string()).optional() });

/**
 * Result of the OSV dependency lookup, carrying what it could NOT check.
 *
 * #5018: this returned a bare array, so an unreachable OSV API produced `[]`
 * — byte-identical to a clean scan — and `buildScanSummary` folded it into
 * "none blocking". `queryOsv` reports `{ vulnerabilities: [], error }` on a
 * non-200 or a timeout; the error was never read.
 */
export interface OsvCheckResult {
  readonly vulnerabilities: OsvVulnerability[];
  /** Lookups that returned an error rather than a verdict. */
  readonly failedLookups: number;
  /** Dependencies queried, and how many the checked manifests declared. */
  readonly queried: number;
  readonly declared: number;
  /**
   * The check did not run to completion — a manifest read error, or
   * `queryOsvBatch` throwing.
   *
   * Distinct from `failedLookups`, which counts dependencies whose INDIVIDUAL
   * lookup errored. The outer catch used to return `OSV_EMPTY`, resetting
   * `failedLookups` to 0 and so defeating the disclosure #5018 added: the
   * summary fell through to "none blocking", the exact phrase that counter
   * exists to prevent.
   *
   * Also distinct from the two HONEST empties — OSV disabled, and a manifest
   * with no dependencies — which keep `checkFailed: false` so the new message
   * does not print on every opted-out run.
   */
  readonly checkFailed: boolean;
  /** Changed-manifest coverage failure; blocks the captured change. */
  readonly manifestError?: string;
}

export const OSV_EMPTY: OsvCheckResult = {
  vulnerabilities: [],
  failedLookups: 0,
  queried: 0,
  declared: 0,
  checkFailed: false,
};

/** The empty result for a check that ERRORED, as opposed to finding nothing. */
const OSV_CHECK_FAILED: OsvCheckResult = { ...OSV_EMPTY, checkFailed: true };

/** Dependencies queried per manifest. The cap is disclosed in the scan summary. */
const OSV_DEPENDENCY_CAP = 20;

/** Load a manifest without recording its contents in failure evidence. */
function loadManifest(
  pkgPath: string,
  required: boolean,
  label: string
): { manifest: z.infer<typeof MANIFEST_SCHEMA> } | { failure: OsvCheckResult } {
  let phase = 'read';
  try {
    if (required && !lstatSync(pkgPath).isFile()) {
      return {
        failure: {
          ...OSV_CHECK_FAILED,
          manifestError: `Changed manifest ${label} is not a regular file`,
        },
      };
    }
    const content = readFileSync(pkgPath, 'utf-8');
    phase = 'parse';
    return { manifest: MANIFEST_SCHEMA.parse(JSON.parse(content)) };
  } catch {
    logger.warn('OSV manifest check did not run', { path: pkgPath, phase });
    return {
      failure: required
        ? {
            ...OSV_CHECK_FAILED,
            manifestError: `Changed manifest ${label} could not be ${phase === 'read' ? 'read' : 'parsed'}`,
          }
        : OSV_CHECK_FAILED,
    };
  }
}

/** Read, parse and lookup failures on changed manifests are blocking coverage failures. */
async function checkManifest(
  pkgPath: string,
  required: boolean,
  signal: AbortSignal | undefined,
  label = pkgPath
): Promise<OsvCheckResult> {
  if (!required && !existsSync(pkgPath)) return OSV_EMPTY;
  const loaded = loadManifest(pkgPath, required, label);
  if ('failure' in loaded) return loaded.failure;
  const pkg = loaded.manifest;
  const declared = Object.keys(pkg.dependencies ?? {}).length;
  const deps = Object.entries(pkg.dependencies ?? {})
    .slice(0, OSV_DEPENDENCY_CAP)
    .map(([name, version]) => ({ name, version: version.replace(/^[\^~>=<]+/, '') }));
  if (deps.length === 0) return OSV_EMPTY;
  return lookupDependencies(deps, declared, required, label, signal);
}

/** Query OSV for one manifest's capped dependency list. */
async function lookupDependencies(
  deps: { name: string; version: string }[],
  declared: number,
  required: boolean,
  label: string,
  signal: AbortSignal | undefined
): Promise<OsvCheckResult> {
  try {
    const results = await queryOsvBatch(deps, undefined, signal);
    const failedLookups = results.filter((r) => r.error !== null).length;
    return {
      vulnerabilities: results.flatMap((r) => [...r.vulnerabilities]),
      failedLookups,
      queried: deps.length,
      declared,
      checkFailed: false,
      // A changed manifest none of whose dependencies were checked has no
      // dependency evidence at all; that blocks rather than reading as clean.
      ...(required && failedLookups >= deps.length ? lookupFailure(label) : {}),
    };
  } catch (error) {
    logger.warn('OSV check did not run', { error: String(error) });
    return required ? { ...OSV_CHECK_FAILED, ...lookupFailure(label) } : OSV_CHECK_FAILED;
  }
}

function lookupFailure(label: string): { manifestError: string } {
  return {
    manifestError: `Dependency lookup failed for changed manifest ${label}; its dependencies were not checked`,
  };
}

/** One manifest the dependency check covers. */
interface ManifestScopeEntry {
  readonly path: string;
  readonly label: string;
  /** Changed in the captured patch: coverage failures block. */
  readonly required: boolean;
}

/**
 * The single dependency-check scope: the workingDir manifest (checked when it
 * exists) united with every changed manifest, de-duplicated by resolved path.
 * A changed entry wins, so a changed workingDir manifest is checked once, as
 * changed.
 */
function dependencyManifestScope(
  targetDir: string,
  captureRoot: string,
  changed: readonly string[]
): ManifestScopeEntry[] {
  const workingDirManifest = resolve(targetDir, 'package.json');
  const scope = new Map<string, ManifestScopeEntry>([
    [workingDirManifest, { path: workingDirManifest, label: workingDirManifest, required: false }],
  ]);
  for (const manifest of changed) {
    const path = resolve(captureRoot, manifest);
    scope.set(path, { path, label: manifest, required: true });
  }
  return [...scope.values()];
}

/** Check the workingDir manifest and every captured changed manifest. */
export async function runOsvCheck(
  targetDir: string,
  config: SecurityGateConfig,
  signal: AbortSignal | undefined
): Promise<OsvCheckResult> {
  if (config.enableOsv === false) return OSV_EMPTY;
  if (config.dependencyCaptureRoot === undefined) {
    return checkManifest(join(targetDir, 'package.json'), false, signal);
  }
  let manifests: string[];
  try {
    manifests = await changedPackageManifests(
      config.dependencyCaptureRoot,
      config.baseline?.sha ?? 'HEAD',
      config,
      signal
    );
  } catch (error) {
    throwIfAborted(signal, 'Dependency manifest discovery aborted');
    return {
      ...OSV_CHECK_FAILED,
      manifestError: `Changed manifest discovery failed: ${String(error)}`,
    };
  }
  let result: OsvCheckResult = { ...OSV_EMPTY, vulnerabilities: [] };
  for (const entry of dependencyManifestScope(targetDir, config.dependencyCaptureRoot, manifests)) {
    throwIfAborted(signal, 'Dependency check aborted');
    result = mergeOsvChecks(
      result,
      await checkManifest(entry.path, entry.required, signal, entry.label)
    );
  }
  return result;
}

/** Aggregate measured dependency coverage and retain changed-manifest failures. */
function mergeOsvChecks(previous: OsvCheckResult, next: OsvCheckResult): OsvCheckResult {
  return {
    vulnerabilities: [...previous.vulnerabilities, ...next.vulnerabilities],
    failedLookups: previous.failedLookups + next.failedLookups,
    queried: previous.queried + next.queried,
    declared: previous.declared + next.declared,
    checkFailed: previous.checkFailed || next.checkFailed,
    ...(previous.manifestError !== undefined || next.manifestError !== undefined
      ? {
          manifestError: [previous.manifestError, next.manifestError]
            .filter((e) => e !== undefined)
            .join('; '),
        }
      : {}),
  };
}
