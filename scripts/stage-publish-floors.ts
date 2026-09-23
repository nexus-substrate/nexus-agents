/**
 * Apply the workspace's security floors (`pnpm.overrides` in the root
 * manifest) to the packages BUNDLED into the published tarball (#6488).
 *
 * The stage resolves with `npm install`, which never reads `pnpm.overrides`.
 * Before bundling that did not matter: a consumer resolved our ranges and could
 * apply its own `overrides`. A bundled version is frozen into the tarball and
 * cannot be overridden downstream, so the floors must hold at stage time.
 *
 * Two halves:
 * - {@link npmOverrides} translates the floors into npm `overrides` for the
 *   STAGED manifest, so resolution satisfies them.
 * - {@link assertBundleFloors} checks every `inBundle` package in the stage's
 *   hidden lockfile against the floors after the install. It is the proof, and
 *   it fails closed for any floor translation could not express.
 *
 * @module scripts/stage-publish-floors
 * (Source: Issue #6488)
 */
import semver from 'semver';

/** One side of an override key: a package name plus an optional version selector. */
interface PackageSelector {
  name: string;
  selector?: string;
}

/** A parsed `pnpm.overrides` key. */
export interface OverrideKey extends PackageSelector {
  /** The `parent` of a `parent>name` key, verbatim (it may carry its own selector). */
  parent?: string;
}

/** An override whose value is a semver range: a floor the bundle must satisfy. */
export interface OverrideFloor extends OverrideKey {
  key: string;
  range: string;
}

/** An override that is not a checkable floor, with the reason. */
export interface SkippedOverride {
  key: string;
  value: string;
  reason: string;
}

export interface ParsedFloors {
  floors: OverrideFloor[];
  skipped: SkippedOverride[];
}

/** A package npm expects to find inside the tarball. */
export interface BundledPackage {
  path: string;
  name: string;
  version: string;
}

export interface FloorViolation {
  path: string;
  version: string;
  key: string;
  range: string;
}

type HiddenLockfile = {
  packages?: Record<string, { version?: string; name?: string; inBundle?: boolean }>;
};

const NAME = String.raw`(?:@[^/@>\s]+\/)?[^/@>\s]+`;
const SELECTOR_RE = new RegExp(`^(${NAME})(?:@(.+))?$`);

/**
 * The `>` that separates `parent>name`. A `>` inside a version range (`>=1`,
 * `@>2`, `<1 >0`) is preceded by `@`, whitespace or another comparator
 * character, or followed by `=`; the separator is not.
 */
const PARENT_SEPARATOR = /(?<![@\s<>=~^|])>(?!=)/g;

function parseSelector(text: string): PackageSelector | undefined {
  const match = SELECTOR_RE.exec(text);
  if (match?.[1] === undefined) return undefined;
  const selector = match[2];
  if (selector === undefined) return { name: match[1] };
  if (semver.validRange(selector) === null) return undefined;
  return { name: match[1], selector };
}

/** Parse a `pnpm.overrides` key; undefined when it is not one of the three shapes. */
export function parseOverrideKey(key: string): OverrideKey | undefined {
  const separators = [...key.matchAll(PARENT_SEPARATOR)];
  if (separators.length > 1) return undefined;
  const at = separators[0]?.index;
  if (at === undefined) return parseSelector(key);
  const parent = key.slice(0, at);
  const child = parseSelector(key.slice(at + 1));
  if (child === undefined || parseSelector(parent) === undefined) return undefined;
  return { ...child, parent };
}

/**
 * Split `pnpm.overrides` into checkable floors and everything else. A value
 * that is not a semver range (`-` removes a dependency, `npm:` aliases,
 * `$name` references) cannot be checked against a version, so it is SKIPPED —
 * and listed, never dropped.
 */
export function parseOverrideFloors(overrides: Record<string, string>): ParsedFloors {
  const floors: OverrideFloor[] = [];
  const skipped: SkippedOverride[] = [];
  for (const [key, value] of Object.entries(overrides)) {
    const parsed = parseOverrideKey(key);
    if (parsed === undefined) {
      skipped.push({ key, value, reason: 'key is not name, name@range or parent>name' });
    } else if (semver.validRange(value) === null) {
      skipped.push({ key, value, reason: 'value is not a semver range' });
    } else {
      floors.push({ ...parsed, key, range: value });
    }
  }
  return { floors, skipped };
}

/**
 * Every package the stage's hidden lockfile marks `inBundle`. An empty result
 * means the stage bundled nothing, which is a broken stage rather than a clean
 * one, so it throws.
 */
export function bundledPackages(lock: HiddenLockfile): BundledPackage[] {
  const bundled: BundledPackage[] = [];
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (meta.inBundle !== true) continue;
    if (meta.version === undefined) {
      throw new Error(`bundled lockfile entry ${path} has no version; cannot check its floors`);
    }
    const name =
      meta.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    bundled.push({ path, name, version: meta.version });
  }
  if (bundled.length === 0) {
    throw new Error('the stage lockfile has no inBundle packages — the stage is broken');
  }
  return bundled;
}

const INCLUDE_PRERELEASE = { includePrerelease: true } as const;

/**
 * Bundled packages that break a floor. A `name@selector` floor binds only the
 * versions its selector matches. A `parent>name` floor is applied to EVERY
 * bundled copy of `name`, not just the one under `parent`: that is stricter
 * than pnpm, and a copy elsewhere below the floor is the same vulnerable code.
 */
export function floorViolations(
  floors: readonly OverrideFloor[],
  bundled: readonly BundledPackage[]
): FloorViolation[] {
  const violations: FloorViolation[] = [];
  for (const pkg of bundled) {
    for (const floor of floors) {
      if (floor.name !== pkg.name) continue;
      if (
        floor.selector !== undefined &&
        !semver.satisfies(pkg.version, floor.selector, INCLUDE_PRERELEASE)
      ) {
        continue;
      }
      if (semver.satisfies(pkg.version, floor.range, INCLUDE_PRERELEASE)) continue;
      violations.push({ path: pkg.path, version: pkg.version, key: floor.key, range: floor.range });
    }
  }
  return violations;
}

type NpmOverrideValue = string | Record<string, string>;

function selectorKey(s: PackageSelector): string {
  return s.selector === undefined ? s.name : `${s.name}@${s.selector}`;
}

function nestUnder(
  overrides: Record<string, NpmOverrideValue>,
  parent: string,
  child: string,
  range: string
): void {
  const existing = overrides[parent];
  const nested = typeof existing === 'string' ? { '.': existing } : { ...(existing ?? {}) };
  overrides[parent] = { ...nested, [child]: range };
}

/**
 * Translate floors into npm `overrides` for the staged manifest. A top-level
 * override on a DIRECT dependency's name is refused by npm (EOVERRIDE), so
 * those floors stay untranslated; the post-install check still covers them.
 * npm nests `parent: { name }` for every descendant of `parent`, which is
 * broader than pnpm's direct-child `parent>name` — the stricter reading.
 */
export function npmOverrides(
  floors: readonly OverrideFloor[],
  directDependencies: Readonly<Record<string, string>>
): { overrides: Record<string, NpmOverrideValue>; untranslated: OverrideFloor[] } {
  const overrides: Record<string, NpmOverrideValue> = {};
  const untranslated: OverrideFloor[] = [];
  for (const floor of floors) {
    if (floor.parent !== undefined) {
      nestUnder(overrides, floor.parent, selectorKey(floor), floor.range);
    } else if (directDependencies[floor.name] !== undefined) {
      untranslated.push(floor);
    } else {
      const key = selectorKey(floor);
      const existing = overrides[key];
      overrides[key] =
        typeof existing === 'object' ? { ...existing, '.': floor.range } : floor.range;
    }
  }
  return { overrides, untranslated };
}

/**
 * Check the stage's bundle against the floors; throw naming each violating
 * `path@version` and the override it breaks. With no floors this passes, and
 * says so with an explicit "0 floors" line.
 */
export function assertBundleFloors(
  lock: HiddenLockfile,
  parsed: ParsedFloors,
  log: (line: string) => void
): void {
  for (const s of parsed.skipped) {
    log(`skipped override "${s.key}": "${s.value}" (${s.reason})`);
  }
  const bundled = bundledPackages(lock);
  if (parsed.floors.length === 0) {
    log(`0 floors in pnpm.overrides; ${String(bundled.length)} bundled package(s) unchecked`);
    return;
  }
  const violations = floorViolations(parsed.floors, bundled);
  log(
    `${String(parsed.floors.length)} floor(s) checked against ${String(bundled.length)} bundled package(s): ` +
      `${String(violations.length)} violation(s)`
  );
  if (violations.length > 0) {
    const lines = violations.map(
      (v) => `  ${v.path}@${v.version} violates "${v.key}": "${v.range}"`
    );
    throw new Error(`bundled packages break the workspace security floors:\n${lines.join('\n')}`);
  }
}
