/**
 * Keep the BUNDLED tree consistent with the ranges its own packages declare
 * (#7614).
 *
 * npm applies an override by REPLACING the dependent's declared range. The
 * stage install therefore needs an in-major pin when a floor selects a newer
 * major than the dependency declares. `fast-uri` no longer needs such a pin:
 * its v3 and v4 floors are scoped separately, so AJV's patched v3 dependency
 * satisfies its declared `^3` range. `protobufjs` under `@google/genai` and
 * `path-to-regexp` under `router` still need in-major pins. A consumer cannot
 * override a bundle, and `npm ci` checks every lockfile edge against its
 * declared range, so it refused to install the package.
 *
 * Two halves:
 * - {@link IN_MAJOR_BACKPORTS} pins each such dependent to the patched release
 *   inside the major it declares. Every advisory behind the floor has a fix in
 *   that major, so the floor's intent holds; the floor check accepts these
 *   versions through {@link backportCovers}.
 * - {@link edgeViolations} is the proof: it walks the staged `node_modules` as
 *   Node would resolve it and fails on any declared edge the shipped version
 *   does not satisfy. It does not depend on the pins being right.
 *
 * @module scripts/stage-publish-edges
 * (Source: Issue #7614)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import semver from 'semver';

/** A patched release inside an older major than the workspace floor names. */
export interface InMajorBackport {
  /** The bundled package that declares the older major. */
  parent: string;
  /**
   * Extra override scopes the same pin must be repeated under. npm resolves an
   * existing parent-scoped override (`@modelcontextprotocol/sdk>ajv`) as its
   * own rule set, which does not inherit a sibling `ajv` rule.
   */
  alsoUnder?: readonly (readonly string[])[];
  name: string;
  major: number;
  /** First release in `major` that fixes every advisory behind the floor. */
  minimum: string;
  /** Why this is safe: the advisories, all fixed at or below `minimum`. */
  advisories: string;
  /**
   * The workspace floor range `minimum` was verified against. A backport covers
   * a version only while the floor still reads exactly this, so raising the
   * floor for a new advisory fails the stage until the backport is re-verified.
   */
  verifiedFloor: string;
}

/**
 * Verified 2026-10-26 against the GitHub advisory database. A bundled package's
 * declared major is the contract; a newer major is only taken when upstream
 * moves its range.
 */
export const IN_MAJOR_BACKPORTS: readonly InMajorBackport[] = [
  {
    parent: '@google/genai',
    name: 'protobufjs',
    major: 7,
    minimum: '7.6.5',
    advisories: 'GHSA-j3f2-48v5-ccww (fixed 7.6.5), GHSA-f38q-mgvj-vph7 (7.6.3)',
    verifiedFloor: '>=7.6.3',
  },
  {
    parent: 'router',
    name: 'path-to-regexp',
    major: 8,
    minimum: '8.4.0',
    advisories: 'GHSA-j3q9-mxjg-w52f, GHSA-27v5-c462-wpq7 (fixed 8.4.0)',
    verifiedFloor: '>=8.4.0',
  },
];

/** The range a backport pins its parent's dependency to, e.g. `>=3.1.9 <4`. */
export function backportRange(b: InMajorBackport): string {
  return `>=${b.minimum} <${String(b.major + 1)}`;
}

/**
 * Whether `version` is a patched release of an older major named by a backport
 * that was verified against exactly `floorRange`. A changed floor covers nothing.
 */
export function backportCovers(
  name: string,
  version: string,
  floorRange: string,
  backports: readonly InMajorBackport[] = IN_MAJOR_BACKPORTS
): boolean {
  return backports.some(
    (b) =>
      b.name === name &&
      b.verifiedFloor === floorRange &&
      semver.satisfies(version, backportRange(b), { includePrerelease: true })
  );
}

/** One pin to apply: the override scope chain and the dependency it fixes. */
export interface BackportPin {
  scope: readonly string[];
  name: string;
  range: string;
}

/** Every override pin the backports need, repeated under each `alsoUnder` scope. */
export function backportPins(
  backports: readonly InMajorBackport[] = IN_MAJOR_BACKPORTS
): BackportPin[] {
  return backports.flatMap((b) =>
    [[b.parent], ...(b.alsoUnder ?? [])].map((scope) => ({
      scope,
      name: b.name,
      range: backportRange(b),
    }))
  );
}

export interface EdgeViolation {
  /** Directory of the dependent, relative to the stage. */
  dependent: string;
  kind: 'dependencies' | 'optionalDependencies' | 'peerDependencies';
  name: string;
  range: string;
  /** The version Node would resolve, or undefined when nothing resolves. */
  resolved?: string;
}

type Manifest = {
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const KINDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;
/** Protocol specs semver cannot judge; tags such as `latest` fall out via `validRange`. */
const NON_SEMVER = /^(npm:|git|https?:|file:|workspace:|link:)/;

function readManifest(dir: string): Manifest | undefined {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8')) as Manifest;
}

/** Version of `name` as Node resolves it from `dir`, stopping at `stageDir`. */
function resolveVersion(stageDir: string, dir: string, name: string): string | undefined {
  for (let current = dir; ; current = dirname(current)) {
    const found = readManifest(join(current, 'node_modules', name))?.version;
    if (found !== undefined) return found;
    if (current === stageDir || current === dirname(current)) return undefined;
  }
}

function packageDirs(nodeModules: string): string[] {
  const dirs: string[] = [];
  for (const entry of readdirSync(nodeModules)) {
    if (entry.startsWith('.')) continue;
    const names = entry.startsWith('@')
      ? readdirSync(join(nodeModules, entry)).map((n) => join(entry, n))
      : [entry];
    for (const name of names) {
      const dir = join(nodeModules, name);
      if (existsSync(join(dir, 'package.json'))) dirs.push(dir);
    }
  }
  return dirs;
}

/** npm optional entries replace same-name required entries, including their ranges. */
function effectiveEntries(
  manifest: Manifest,
  kind: EdgeViolation['kind']
): Array<[string, string]> {
  const entries = Object.entries(manifest[kind] ?? {});
  return kind === 'dependencies'
    ? entries.filter(([name]) => !Object.hasOwn(manifest.optionalDependencies ?? {}, name))
    : entries;
}

/**
 * Every declared edge of every package under `<stageDir>/node_modules` (and of
 * the staged package itself) that the shipped tree does not satisfy. A missing
 * `dependencies` target is a violation; a missing optional dependency or peer
 * is not, because npm tolerates their absence. A present one must still fit.
 */
export function edgeViolations(stageDir: string): EdgeViolation[] {
  const violations: EdgeViolation[] = [];
  const visit = (dir: string, manifest: Manifest): void => {
    for (const kind of KINDS) {
      for (const [name, range] of effectiveEntries(manifest, kind)) {
        if (NON_SEMVER.test(range) || semver.validRange(range) === null) continue;
        const resolved = resolveVersion(stageDir, dir, name);
        const ok =
          resolved === undefined
            ? kind !== 'dependencies'
            : semver.satisfies(resolved, range, { includePrerelease: true });
        if (!ok) {
          violations.push({
            dependent: relative(stageDir, dir) || '.',
            kind,
            name,
            range,
            ...(resolved === undefined ? {} : { resolved }),
          });
        }
      }
    }
  };
  const walk = (nodeModules: string): void => {
    for (const dir of packageDirs(nodeModules)) {
      const manifest = readManifest(dir);
      if (manifest !== undefined) visit(dir, manifest);
      const nested = join(dir, 'node_modules');
      if (existsSync(nested)) walk(nested);
    }
  };
  const own = readManifest(stageDir);
  if (own !== undefined) visit(stageDir, own);
  const top = join(stageDir, 'node_modules');
  if (existsSync(top)) walk(top);
  return violations;
}

/** Throw naming every unsatisfied edge; log the count otherwise. */
export function assertBundleEdges(stageDir: string, log: (line: string) => void): void {
  const violations = edgeViolations(stageDir);
  log(`bundled dependency edges checked: ${String(violations.length)} violation(s)`);
  if (violations.length === 0) return;
  const lines = violations.map(
    (v) =>
      `  ${v.dependent} declares ${v.kind} ${v.name}@${v.range}, ` +
      `ships ${v.resolved ?? 'nothing'}`
  );
  throw new Error(
    `the bundled tree breaks ranges its own packages declare; a consumer's \`npm ci\` would refuse it:\n${lines.join('\n')}`
  );
}
