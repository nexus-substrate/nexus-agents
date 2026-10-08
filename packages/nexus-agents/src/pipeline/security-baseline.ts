/** Complete, occurrence-aware comparison against a pinned security baseline (#7238). */
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, readlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { execFileTree, type ExecFileTreeOptions } from '../cli-adapters/exec-file-tree.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { executeSecurityScan, prepareSecurityScan } from '../mcp/tools/security-scan.js';
import { SEVERITY_ORDER, type SecurityFinding } from '../security/sarif-types.js';
import type { SecurityGateConfig } from './security-gate.js';
import { throwIfAborted } from '../adapters/abort-utils.js';
import { pipelineScratchRoot } from './pipeline-scratch-root.js';
import {
  scanErrors,
  normalizedScan,
  compareParseCoverage,
  type ScanResult,
} from './security-baseline-coverage.js';

export interface SecurityBaseline {
  readonly sha: string;
  readonly directory: string;
}

export interface SecurityBaselineComparison {
  readonly baseSha: string;
  readonly baseCount: number | null;
  readonly worktreeCount: number | null;
  /** Null when the comparison could not measure introductions. */
  readonly introducedBlockingCount: number | null;
  readonly blockingFindings: readonly Pick<
    SecurityFinding,
    'rule' | 'file' | 'startLine' | 'severity'
  >[];
  readonly complete: boolean;
  readonly errors: readonly string[];
  /** Stable, untouched files for which the scanner could not measure full coverage. */
  readonly unscannedCoverage?: readonly string[];
  /** Scanner executable version measured for both sides of the comparison. */
  readonly scannerVersion?: string;
}

const blocking = (finding: SecurityFinding): boolean =>
  finding.severity === 'critical' || finding.severity === 'high';

function key(finding: SecurityFinding): string {
  return JSON.stringify([finding.rule, finding.file, finding.snippet?.replace(/\s+/g, ' ').trim()]);
}

/** A changed source range cannot inherit credit for a removed occurrence. */
function preservedLine(finding: SecurityFinding, diff: string): number | undefined {
  let offset = 0;
  for (const match of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? 1);
    const newCount = Number(match[4] ?? 1);
    const oldEnd = oldStart + oldCount - 1;
    if (
      oldCount > 0 &&
      finding.startLine <= oldEnd &&
      (finding.endLine ?? finding.startLine) >= oldStart
    )
      return undefined;
    if ((oldCount === 0 ? oldStart : oldEnd) < finding.startLine) offset += newCount - oldCount;
  }
  return finding.startLine + offset;
}

/** Counts are multisets; matching consumes one preserved base occurrence at a time. */
async function introducedFindings(
  base: readonly SecurityFinding[],
  worktree: readonly SecurityFinding[],
  git: (cwd: string, args: string[]) => Promise<string>,
  target: string,
  sha: string
): Promise<SecurityFinding[]> {
  const diffs = new Map<string, string>();
  for (const file of new Set(base.map((finding) => finding.file))) {
    if (isAbsolute(file) || file.split('/').includes('..'))
      throw new Error('Finding path outside scanned tree');
    diffs.set(
      file,
      await git(target, [
        'diff',
        '--text',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--unified=0',
        sha,
        '--',
        file,
      ])
    );
  }
  const remaining = [...base];
  const result: SecurityFinding[] = [];
  for (const finding of worktree) {
    const index = remaining.findIndex(
      (old) =>
        key(old) === key(finding) &&
        preservedLine(old, diffs.get(old.file) ?? '') === finding.startLine &&
        SEVERITY_ORDER[finding.severity] >= SEVERITY_ORDER[old.severity]
    );
    if (index >= 0) remaining.splice(index, 1);
    else if (
      blocking(finding) ||
      remaining.some(
        (old) =>
          key(old) === key(finding) &&
          SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[old.severity]
      )
    )
      result.push(finding);
  }
  return result;
}

/** Archive extraction never checks out or mutates the operator's repository. */
export async function compareSecurityBaseline(
  target: string,
  rulesets: readonly string[],
  config: SecurityGateConfig,
  signal?: AbortSignal
): Promise<SecurityBaselineComparison> {
  const baseline = config.baseline;
  if (baseline === undefined) throw new Error('Security baseline required');
  let directory: string | undefined;
  let base: ScanResult = { error: 'base scan did not run' };
  let worktree: ScanResult = { error: 'worktree scan did not run' };
  let sha = baseline.sha;
  const execOptions = comparisonExecOptions(config, signal);
  const git = comparisonGit(execOptions);
  try {
    sha = (
      await git(baseline.directory, ['rev-parse', '--verify', `${baseline.sha}^{commit}`])
    ).trim();
    if (!/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('Base did not resolve to a commit SHA');
    directory = await allocateComparisonDirectory(target, config, execOptions);
    const archive = await archiveBaseline({ target, directory, baseline, sha, git, execOptions });
    ({ base, worktree } = await scanTrees({
      target,
      rulesets,
      config,
      signal,
      directory,
      archive,
    }));
    throwIfAborted(signal, 'Security baseline scan aborted');
    return await assessComparison({
      sha,
      base,
      worktree,
      git,
      target,
      baseDirectory: archive.target,
    });
  } catch (error: unknown) {
    throwIfAborted(signal, 'Security baseline scan aborted');
    return incomplete(sha, base, worktree, [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  }
}

function incomplete(
  sha: string,
  base: ScanResult,
  worktree: ScanResult,
  errors: string[],
  unscannedCoverage: readonly string[] = []
): SecurityBaselineComparison {
  return {
    baseSha: sha,
    baseCount: 'error' in base ? null : base.totalFindings,
    worktreeCount: 'error' in worktree ? null : worktree.totalFindings,
    introducedBlockingCount: null,
    blockingFindings: [],
    unscannedCoverage,
    ...scannerVersion(base, worktree),
    complete: false,
    errors,
  };
}

async function allocateComparisonDirectory(
  target: string,
  config: SecurityGateConfig,
  options: import('../cli-adapters/exec-file-tree.js').ExecFileTreeOptions
): Promise<string> {
  if (config.wrapper === undefined) {
    const root = pipelineScratchRoot([target, config.baseline?.directory ?? target, process.cwd()]);
    return mkdtemp(join(root, 'security-baseline-'));
  }
  // The wrapper pins TMPDIR to its private writable host directory beside the
  // scratch checkout, outside the scanned tree. Host NEXUS_TMPDIR may be read-only
  // in bwrap, so allocate through the wrapper instead of bypassing its isolation.
  const path = (await execFileTree('mktemp', ['-d'], options)).stdout.trim();
  if (!isAbsolute(path)) throw new Error('Sandbox did not allocate a comparison directory');
  return path;
}

async function assessComparison(input: {
  sha: string;
  base: ScanResult;
  worktree: ScanResult;
  target: string;
  baseDirectory: string;
  git: (cwd: string, args: string[]) => Promise<string>;
}): Promise<SecurityBaselineComparison> {
  const { sha, base, worktree, git, target } = input;
  const errors = [...scanErrors(base, 'base'), ...scanErrors(worktree, 'worktree')];
  if ('error' in base || 'error' in worktree) return incomplete(sha, base, worktree, errors);
  const coverage = await compareParseCoverage({
    base,
    worktree,
    baseDirectory: input.baseDirectory,
    target,
    pinnedEntry: async (file) => git(target, ['ls-tree', '-z', sha, '--', file]),
    diff: async (file) =>
      git(target, [
        'diff',
        '--text',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--unified=0',
        sha,
        '--',
        file,
      ]),
  });
  errors.push(...coverage.errors);
  if (errors.length > 0) return incomplete(sha, base, worktree, errors, coverage.unscannedCoverage);
  const findings = await introducedFindings(base.findings, worktree.findings, git, target, sha);
  return {
    baseSha: sha,
    baseCount: base.totalFindings,
    worktreeCount: worktree.totalFindings,
    introducedBlockingCount: findings.length,
    blockingFindings: actionableFindings(findings),
    complete: true,
    errors: [],
    unscannedCoverage: coverage.unscannedCoverage,
    ...scannerVersion(base, worktree),
  };
}

/** Archive attributes can omit/substitute blobs: verify bytes against the pinned tree. */
async function verifyArchive(directory: string, tree: string): Promise<void> {
  if (tree === '') return; // An explicitly empty Git tree has no blobs to extract.
  for (const entry of tree.split('\0').filter((record) => record !== '')) {
    const { mode, hash, file } = parseTreeEntry(entry);
    const contents =
      mode === '120000'
        ? Buffer.from(await readlink(join(directory, file)))
        : await readFile(join(directory, file));
    const digest = createHash(hash.length === 64 ? 'sha256' : 'sha1')
      .update(`blob ${String(contents.length)}\0`)
      .update(contents)
      .digest('hex');
    if (digest !== hash) throw new Error(`Pinned archive content differs: ${file}`);
  }
}

function parseTreeEntry(entry: string): { mode: string; hash: string; file: string } {
  const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
  if (match === null) throw new Error('Unreadable pinned Git tree');
  const [, mode, type, hash, file] = match;
  if (
    mode === undefined ||
    type !== 'blob' ||
    hash === undefined ||
    file === undefined ||
    isAbsolute(file) ||
    file.split('/').includes('..')
  )
    throw new Error('Pinned tree coverage incomplete: unsupported tree entry');
  return { mode, hash, file };
}

type ComparisonGit = (cwd: string, args: string[]) => Promise<string>;

function comparisonExecOptions(
  config: SecurityGateConfig,
  signal?: AbortSignal
): ExecFileTreeOptions {
  return {
    signal,
    env: hermeticGitEnv(config.env),
    wrapper: config.wrapper,
    timeoutMs: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  };
}

function comparisonGit(options: ExecFileTreeOptions): ComparisonGit {
  return async (cwd, args) =>
    (
      await execFileTree(
        'git',
        [
          '--literal-pathspecs',
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'core.fsmonitor=false',
          ...args,
        ],
        { ...options, cwd }
      )
    ).stdout;
}

async function archiveBaseline(input: {
  target: string;
  directory: string;
  baseline: SecurityBaseline;
  sha: string;
  git: ComparisonGit;
  execOptions: ExecFileTreeOptions;
}): Promise<{ root: string; target: string }> {
  const { target, directory, baseline, sha, git, execOptions } = input;
  const baseDir = join(directory, 'base');
  const prefix = (await git(target, ['rev-parse', '--show-prefix'])).trim();
  if (isAbsolute(prefix) || prefix.split('/').includes('..'))
    throw new Error('Invalid scan subtree');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(baseDir);
  const archive = join(directory, 'base.tar');
  await git(baseline.directory, ['archive', '--format=tar', `--output=${archive}`, sha]);
  await execFileTree('tar', ['-xf', archive, '-C', baseDir], execOptions);
  await verifyArchive(baseDir, await git(baseline.directory, ['ls-tree', '-r', '-z', sha]));
  return { root: baseDir, target: join(baseDir, prefix) };
}

async function scanTrees(input: {
  target: string;
  rulesets: readonly string[];
  config: SecurityGateConfig;
  signal: AbortSignal | undefined;
  directory: string;
  archive: { root: string; target: string };
}): Promise<{ base: ScanResult; worktree: ScanResult }> {
  const { target, rulesets, config, signal, directory, archive } = input;
  const prepared = await prepareSecurityScan(rulesets, {
    ...comparisonExecOptions(config, signal),
    directory,
  });
  if ('error' in prepared) throw new Error(prepared.error);
  const scanInput = {
    scanner: 'semgrep' as const,
    rulesets: [...rulesets],
    maxFindings: Number.MAX_SAFE_INTEGER,
  };
  const options = {
    signal,
    env: config.env,
    wrapper: config.wrapper,
    completeResults: true,
    preparedScan: prepared,
  };
  const base = normalizedScan(
    await executeSecurityScan(
      { ...scanInput, target: archive.target },
      { ...options, root: archive.root }
    ),
    archive.target
  );
  const worktree = normalizedScan(
    await executeSecurityScan({ ...scanInput, target }, { ...options, root: config.root }),
    target
  );
  return { base, worktree };
}

/** Transport only actionable locations; snippets remain internal matching evidence. */
function actionableFindings(
  findings: readonly SecurityFinding[]
): SecurityBaselineComparison['blockingFindings'] {
  return findings.map(({ rule, file, startLine, severity }) => ({
    rule,
    file,
    startLine,
    severity,
  }));
}

function scannerVersion(base: ScanResult, worktree: ScanResult): { scannerVersion?: string } {
  const version = 'error' in base ? undefined : base.scannerVersion;
  const other = 'error' in worktree ? undefined : worktree.scannerVersion;
  const measured = version ?? other;
  return measured === undefined ? {} : { scannerVersion: measured };
}
