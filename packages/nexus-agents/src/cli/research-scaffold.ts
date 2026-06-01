/**
 * research-scaffold — auto-create empty research registry files when missing.
 *
 * On a fresh install or in a sandboxed environment where the project doesn't
 * have `docs/research/registry/`, the research workflows previously errored
 * with `Failed to load papers registry: ENOENT`. The user has no idea what
 * to do.
 *
 * This module provides `ensureResearchRegistry()`: idempotent scaffolding
 * that creates empty YAML registries on ENOENT, announces what it did to
 * stderr (so the operator knows), and returns the path that's now safe to
 * read.
 *
 * Source: Issue #2470 (epic #2467 child).
 */

import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

import type { Result } from '../core/index.js';
import { ok, err, getErrorMessage } from '../core/index.js';
import { ParseError } from '../core/types/workflow.js';

import { REGISTRY_PATH, PAPERS_FILE, TECHNIQUES_FILE } from './research-helpers-io.js';
import { parseBoolEnv } from '../config/defaults-env.js';

/**
 * Names of the registry files this scaffolder knows how to create.
 * `sources.yaml` and `alignments.yaml` live alongside but are populated by
 * different code paths; this scaffolder only owns the two YAML registries
 * that block `research_query` / `research_synthesize` on a fresh install.
 */
type ScaffoldedFile = typeof PAPERS_FILE | typeof TECHNIQUES_FILE;

const SCHEMA_VERSION = '1.0';

const ANNOUNCED = new Set<string>();

function announceOnce(path: string, kind: ScaffoldedFile): void {
  // De-dupe so that running multiple research commands in one session
  // produces one announcement per scaffolded file, not per call.
  if (ANNOUNCED.has(path)) return;
  ANNOUNCED.add(path);
  process.stderr.write(
    `[scaffold] Created empty ${kind} at ${path}; add entries via 'nexus-agents research add' or research_add MCP tool.\n`
  );
}

/**
 * Operator opt-out. When set, scaffolding errors loudly with an actionable
 * message instead of silently writing files. Useful for CI and for
 * environments that want strict "fail when state is wrong" semantics.
 */
function scaffoldDisabled(): boolean {
  return parseBoolEnv('NEXUS_NO_SCAFFOLD', false);
}

function emptyPapersYaml(): string {
  return stringifyYaml({ schema_version: SCHEMA_VERSION, papers: {} });
}

function emptyTechniquesYaml(): string {
  return stringifyYaml({ schema_version: SCHEMA_VERSION, techniques: {} });
}

/**
 * Create the registry directory + an empty YAML file if either is missing.
 * Idempotent: existing files are left untouched.
 *
 * Scaffolds only when `<rootDir>/docs/` already exists. That guard keeps
 * tests, vitest's package cwd, and random scratch directories from getting
 * a `docs/research/` subtree implicitly. Operators on a real project root
 * (which always has `docs/`, either from cloning the repo or running
 * `nexus-agents init`) still get the auto-create behavior the issue asks for.
 *
 * Returns the resolved file path on success, or a ParseError when scaffolding
 * is disabled / refused (so the caller can pass the error through unchanged
 * for backwards compat with existing call sites).
 */
export async function ensureRegistryFile(
  rootDir: string,
  filename: ScaffoldedFile
): Promise<Result<string, ParseError>> {
  const filePath = resolve(rootDir, REGISTRY_PATH, filename);

  if (existsSync(filePath)) return ok(filePath);

  if (scaffoldDisabled()) {
    return err(
      new ParseError(
        `Registry file missing: ${filePath}. Scaffolding disabled (NEXUS_NO_SCAFFOLD=1). Create the file manually or unset the env var.`
      )
    );
  }

  // Refuse to create a docs/ subtree in directories that aren't already
  // documented project roots. The presence of `<rootDir>/docs/` is the
  // strong signal we use.
  if (!existsSync(resolve(rootDir, 'docs'))) {
    return err(
      new ParseError(
        `Registry file missing: ${filePath}. ${rootDir}/docs/ does not exist; ` +
          `refusing to create a Nexus subtree in a non-documented root. ` +
          `Run 'nexus-agents init' first, or create ${rootDir}/docs/ manually.`
      )
    );
  }

  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
    const content = filename === PAPERS_FILE ? emptyPapersYaml() : emptyTechniquesYaml();
    await fs.writeFile(filePath, content, 'utf-8');
    announceOnce(filePath, filename);
    return ok(filePath);
  } catch (e: unknown) {
    return err(
      new ParseError(
        `Failed to scaffold ${filename} at ${filePath}: ${getErrorMessage(e)}. Set NEXUS_NO_SCAFFOLD=1 and create manually if scaffolding is unwanted.`
      )
    );
  }
}

/**
 * Convenience: scaffold both papers.yaml and techniques.yaml. Used by the
 * research workflow startup paths that need both registries available.
 */
export async function ensureResearchRegistry(rootDir?: string): Promise<Result<void, ParseError>> {
  const root = rootDir ?? process.cwd();
  const papers = await ensureRegistryFile(root, PAPERS_FILE);
  if (!papers.ok) return papers;
  const techniques = await ensureRegistryFile(root, TECHNIQUES_FILE);
  if (!techniques.ok) return techniques;
  return ok(undefined);
}

/**
 * Test-only reset of the announcement de-dupe set. Production code never
 * needs this; tests do because Vitest reuses process state across files.
 */
export function _resetAnnouncedForTests(): void {
  ANNOUNCED.clear();
}
