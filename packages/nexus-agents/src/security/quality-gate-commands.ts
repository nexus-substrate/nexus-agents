/**
 * Resolve quality-gate checks to repository-declared commands (#4355).
 *
 * The gate used to hard-code `npx eslint`, `npx tsc`, `npx vitest` and
 * `pnpm build`. Two problems, and the second is the serious one:
 *
 *  - **It described the wrong project.** A repo that declares Oxlint and npm
 *    got a red `lint` verdict from an ESLint that the repo does not use and
 *    does not configure, while `npm run lint` was green. The gate reported a
 *    fact about a toolchain nobody had chosen.
 *  - **`npx` downloads.** A missing checker was silently fetched — an
 *    unpinned, undeclared package executed *during a quality check*. A gate
 *    that installs software to reach its verdict has a supply-chain surface
 *    its callers never opted into.
 *
 * So resolution is now: the repository's own declared script, run through the
 * package manager its lockfile selects. When no script is declared the check
 * is **unconfigured** — reported as such, never substituted with a guess.
 *
 * @module security/quality-gate-commands
 * (Source: Issue #4355)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Package managers we can drive, in lockfile-detection order. */
export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/** The checks that map to a repository script. */
export type ScriptedCheck = 'lint' | 'typecheck' | 'tests' | 'build';

const LOCKFILES: ReadonlyArray<{ file: string; manager: PackageManager }> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' },
];

/**
 * Candidate script names per check, most canonical first.
 *
 * Alternates are common spellings, not guesses at a tool: every candidate is
 * still something the repository declared for itself.
 */
const SCRIPT_CANDIDATES: Record<ScriptedCheck, readonly string[]> = {
  lint: ['lint'],
  typecheck: ['typecheck', 'type-check', 'types'],
  tests: ['test', 'tests'],
  build: ['build'],
};

export type ResolvedCheck =
  | {
      readonly kind: 'command';
      readonly command: string;
      readonly args: readonly string[];
      /** Which declared script this resolved to, for the result details. */
      readonly script: string;
    }
  | {
      readonly kind: 'unconfigured';
      readonly reason: string;
    };

/**
 * Which package manager the repository's lockfile selects.
 *
 * Falls back to `npm` when no lockfile is present — it ships with Node, so it
 * is the one manager certain to be available. The fallback is safe because it
 * only ever runs a script the repository declared; it cannot introduce a tool.
 */
export function detectPackageManager(projectDir: string): PackageManager {
  for (const { file, manager } of LOCKFILES) {
    if (existsSync(join(projectDir, file))) return manager;
  }
  return 'npm';
}

/** Read `scripts` from the project's package.json, or undefined if unreadable. */
function readScripts(projectDir: string): Record<string, string> | undefined {
  const manifest = join(projectDir, 'package.json');
  if (!existsSync(manifest)) return undefined;

  try {
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (typeof scripts !== 'object' || scripts === null) return undefined;

    const out: Record<string, string> = {};
    for (const [name, body] of Object.entries(scripts)) {
      if (typeof body === 'string') out[name] = body;
    }
    return out;
  } catch {
    // An unparseable manifest tells us nothing about the project's toolchain.
    // Guessing one from a file we could not read is exactly the failure this
    // module exists to remove.
    return undefined;
  }
}

/**
 * Resolve a check to the repository's own command, or report it unconfigured.
 *
 * `--silent` keeps the package manager's own banner out of the captured
 * output, so a failure's details are the tool's, not the runner's.
 */
export function resolveCheckCommand(projectDir: string, check: ScriptedCheck): ResolvedCheck {
  const scripts = readScripts(projectDir);
  if (scripts === undefined) {
    return {
      kind: 'unconfigured',
      reason: `no readable package.json in ${projectDir}, so the "${check}" script could not be resolved`,
    };
  }

  const candidates = SCRIPT_CANDIDATES[check];
  const found = candidates.find((name) => (scripts[name] ?? '').trim() !== '');
  if (found === undefined) {
    return {
      kind: 'unconfigured',
      reason: `no "${check}" script declared (looked for: ${candidates.join(', ')})`,
    };
  }

  return {
    kind: 'command',
    command: detectPackageManager(projectDir),
    args: ['run', '--silent', found],
    script: found,
  };
}
