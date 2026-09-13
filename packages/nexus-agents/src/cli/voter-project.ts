/**
 * nexus-agents/cli - Target project for the voter panel (#6110)
 *
 * `getVoterPrompts(project)` puts the project name into every voter's system
 * prompt, and until #6110 nothing ever passed one: a consuming repository got a
 * scope_steward judging its proposal against "the nexus-agents project". This
 * module answers "which project is the panel judging?" from three sources, in
 * order, and says which one answered:
 *
 *   1. `input`   — the caller's explicit `project` (tool input or `--project`).
 *   2. `derived` — `owner/repo` parsed from the `origin` URL in the repo's
 *                  `.git/config`, else the nearest `package.json` `name`.
 *   3. `default` — `nexus-agents`, this repository's own name.
 *
 * Decided by a 7-voter panel (option C, 4 of 7; job
 * `job-consensus_vote-b97309d13ca77db9`) with two safeguards adopted from the
 * minority: the SOURCE is disclosed on the response so a forgotten input reads
 * as `default` next to the verdict instead of a silent mis-scope, and no
 * candidate — from any source — reaches a prompt unless it matches
 * {@link VOTER_PROJECT_PATTERN}. Derivation is a pure parse of files the
 * process can already read; it never spawns `git`.
 *
 * @module cli/voter-project
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import type { ILogger } from '../core/index.js';
import { findRepoRoot } from '../config/repo-root-detection.js';
import { DEFAULT_VOTER_PROJECT } from './voter-prompts.js';

/**
 * The only shape a project name may take before it is interpolated into a
 * prompt. Admits `owner/repo`, scoped npm names (`@scope/name`) and plain
 * package names; refuses whitespace, quotes and every shell metacharacter.
 */
export const VOTER_PROJECT_PATTERN = /^[A-Za-z0-9._/@-]{1,200}$/;

/**
 * The optional `project` input every panel tool accepts (#6110, #6123):
 * `consensus_vote`, `pr_review` and `supply_chain_tradeoff_panel` share this
 * one field so the pattern and its description are stated once.
 */
export const VoterProjectInputSchema = z
  .string()
  .regex(VOTER_PROJECT_PATTERN)
  .optional()
  .describe(
    'The project the panel is judging (#6110), e.g. `acme/widgets` — it replaces `nexus-agents` ' +
      "in every voter's system prompt, so a consuming repository is not judged against this " +
      "one's mission and governance files. When omitted the name is DERIVED from the server's " +
      'working directory (the `origin` remote as `owner/repo`, else the nearest `package.json` ' +
      'name) and falls back to `nexus-agents`; the response discloses which on `project.source`. ' +
      'Letters, digits and `._/@-` only, at most 200 characters.'
  );

/** Which of the three sources supplied the project name. */
export type VoterProjectSource = 'input' | 'derived' | 'default';

/** The project the voter panel was told it is judging, and how that was decided. */
export interface ResolvedVoterProject {
  readonly name: string;
  readonly source: VoterProjectSource;
}

/** A candidate the resolver considered and refused, with the reason. */
export interface RejectedVoterProjectCandidate {
  readonly origin: 'input' | 'git-origin' | 'package-name';
  readonly candidate: string;
  readonly reason: string;
}

/** {@link ResolvedVoterProject} plus the candidates rejected on the way to it. */
export interface VoterProjectResolution extends ResolvedVoterProject {
  /** Rejected candidates in the order they were tried; empty when none were. */
  readonly rejected: readonly RejectedVoterProjectCandidate[];
}

/** Ancestor-walk cap; mirrors `findRepoRoot`'s guard against pathological trees. */
const MAX_ANCESTOR_DEPTH = 64;

/** Longest `.git/config` or `package.json` the resolver will read. */
const MAX_READ_BYTES = 64 * 1024;

function readBounded(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_READ_BYTES) return undefined;
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Locate the git config that holds the remotes for the repo containing `cwd`.
 *
 * A worktree's `.git` is a FILE (`gitdir: <path>`) whose gitdir carries a
 * `commondir` back-reference to the main repository's `.git`, where the remotes
 * live. Both hops are plain file reads.
 */
function locateGitConfig(cwd: string): string | undefined {
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === null) return undefined;
  const dotGit = join(repoRoot, '.git');
  try {
    if (statSync(dotGit).isDirectory()) return join(dotGit, 'config');
  } catch {
    return undefined;
  }
  const gitdir = worktreeGitDir(repoRoot, dotGit);
  if (gitdir === undefined) return undefined;
  const commondir = readBounded(join(gitdir, 'commondir'))?.trim();
  const commonRoot =
    commondir === undefined || commondir === '' ? gitdir : resolve(gitdir, commondir);
  return join(commonRoot, 'config');
}

/** The gitdir a worktree's `.git` FILE points at, absolute; undefined when it is not one. */
function worktreeGitDir(repoRoot: string, dotGitFile: string): string | undefined {
  const target = readBounded(dotGitFile)?.match(/^gitdir:\s*(.+?)\s*$/m)?.[1];
  if (target === undefined) return undefined;
  return isAbsolute(target) ? target : resolve(repoRoot, target);
}

/**
 * The `url` of `[remote "origin"]` in a git config, or undefined. Sections are
 * scanned by header so a `url` under another remote is never picked up.
 */
function originUrlFromConfig(config: string): string | undefined {
  let inOrigin = false;
  for (const rawLine of config.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inOrigin = /^\[remote\s+"origin"\]$/.test(line);
      continue;
    }
    if (!inOrigin) continue;
    const match = line.match(/^url\s*=\s*(.+)$/);
    if (match?.[1] !== undefined) return match[1].trim();
  }
  return undefined;
}

/**
 * `owner/repo` from a git remote URL, or undefined when the URL has fewer than
 * two path segments. Handles `git@host:owner/repo(.git)`,
 * `scheme://[user@]host[:port]/owner/repo(.git)` and nested host paths (the
 * last two segments win).
 */
function ownerRepoFromRemoteUrl(url: string): string | undefined {
  const schemeMatch = url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.+)$/i);
  const scpMatch = url.match(/^[^/@:]+@[^/:]+:(.+)$/);
  const path = schemeMatch?.[1] ?? scpMatch?.[1];
  if (path === undefined) return undefined;
  const segments = path
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/')
    .filter((segment) => segment !== '');
  if (segments.length < 2) return undefined;
  return segments.slice(-2).join('/');
}

/** `name` of the nearest `package.json` at or above `cwd`, when it is a string. */
function nearestPackageName(cwd: string): string | undefined {
  let current = resolve(cwd);
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    const raw = readBounded(join(current, 'package.json'));
    if (raw !== undefined) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
          return typeof parsed.name === 'string' ? parsed.name : undefined;
        }
      } catch {
        return undefined;
      }
      return undefined;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

/** Why a candidate fails {@link VOTER_PROJECT_PATTERN}, or undefined when it passes. */
function patternRejection(candidate: string): string | undefined {
  if (VOTER_PROJECT_PATTERN.test(candidate)) return undefined;
  return `does not match the project-name pattern ${VOTER_PROJECT_PATTERN.source}`;
}

/** The derived candidates in fallback order, each tagged with where it came from. */
function derivedCandidates(cwd: string): ReadonlyArray<{
  origin: 'git-origin' | 'package-name';
  candidate: string | undefined;
  absentReason: string;
}> {
  const configPath = locateGitConfig(cwd);
  const config = configPath === undefined ? undefined : readBounded(configPath);
  const originUrl = config === undefined ? undefined : originUrlFromConfig(config);
  const ownerRepo = originUrl === undefined ? undefined : ownerRepoFromRemoteUrl(originUrl);
  return [
    {
      origin: 'git-origin',
      candidate: ownerRepo,
      absentReason:
        originUrl === undefined
          ? 'no origin remote'
          : `origin URL carries no owner/repo path: ${originUrl}`,
    },
    { origin: 'package-name', candidate: nearestPackageName(cwd), absentReason: 'no package name' },
  ];
}

/**
 * Resolve the project the voter panel should judge against.
 *
 * `input` wins when it passes the pattern; otherwise the `origin` remote of the
 * repository containing `cwd`, then the nearest `package.json` name; otherwise
 * {@link DEFAULT_VOTER_PROJECT}. A candidate that fails the pattern is recorded
 * on `rejected` with its reason and the next source is tried — so the result
 * ALWAYS carries a name the prompt may safely interpolate, and the caller can
 * log exactly what was refused. Pure over the filesystem: no subprocess.
 */
export function resolveVoterProject(args: {
  readonly input?: string | undefined;
  readonly cwd: string;
}): VoterProjectResolution {
  const rejected: RejectedVoterProjectCandidate[] = [];

  if (args.input !== undefined) {
    const reason = patternRejection(args.input);
    if (reason === undefined) return { name: args.input, source: 'input', rejected };
    rejected.push({ origin: 'input', candidate: args.input, reason });
  }

  for (const { origin, candidate, absentReason } of derivedCandidates(args.cwd)) {
    if (candidate === undefined) {
      // An absent candidate is not a rejection — nothing was refused. Only an
      // origin URL that EXISTED but carried no owner/repo is worth recording.
      if (origin === 'git-origin' && absentReason !== 'no origin remote') {
        rejected.push({ origin, candidate: '', reason: absentReason });
      }
      continue;
    }
    const reason = patternRejection(candidate);
    if (reason === undefined) return { name: candidate, source: 'derived', rejected };
    rejected.push({ origin, candidate, reason });
  }

  return { name: DEFAULT_VOTER_PROJECT, source: 'default', rejected };
}

/**
 * Resolve the project a panel judges and log it once per run: the chosen name
 * and source at info, and every candidate the pattern refused at warn with its
 * reason, so a `default` next to a verdict is explained. Shared by every tool
 * that runs a voter panel (#6123); each resolves ONCE per run.
 */
export function resolveAndLogVoterProject(
  input: string | undefined,
  logger: ILogger
): ResolvedVoterProject {
  const { name, source, rejected } = resolveVoterProject({ input, cwd: process.cwd() });
  for (const r of rejected) {
    logger.warn('Voter project candidate rejected', {
      origin: r.origin,
      candidate: r.candidate,
      reason: r.reason,
    });
  }
  logger.info('Voter project resolved', { project: name, source });
  return { name, source };
}
