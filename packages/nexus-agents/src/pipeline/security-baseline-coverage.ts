/** Coverage evidence for the pinned security comparison (#7238). */
import { createHash } from 'node:crypto';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { hasControlCharacter } from '../security/sarif-diagnostics.js';
import type {
  SarifParseResult,
  SecurityFinding,
  ScannerParseDiagnostic,
  ScannerFileDiagnostic,
} from '../security/sarif-types.js';

export type ScanResult = SarifParseResult | { error: string };

export function scanErrors(scan: ScanResult, side: string): string[] {
  if ('error' in scan) return [`${side}: ${scan.error}`];
  const errors = scan.errors.map((error) => `${side}: ${error}`);
  if (scan.coverageComplete !== true || scan.totalFindings !== scan.findings.length)
    errors.push(`${side}: scan coverage is incomplete`);
  for (const finding of scan.findings) {
    if (
      isAbsolute(finding.file) ||
      finding.file.split('/').includes('..') ||
      /^[a-z]+:/i.test(finding.file)
    )
      errors.push(`${side}: finding path outside scanned tree: ${finding.file}`);
    if (ambiguousSnippet(finding))
      errors.push(
        `${side}: missing or truncated snippet: ${finding.rule} ${finding.file}:${String(finding.startLine)}`
      );
  }
  return errors;
}

export function normalizedScan(scan: ScanResult, directory: string): ScanResult {
  if ('error' in scan) return scan;
  return {
    ...scan,
    scannerDiagnostics: (scan.scannerDiagnostics ?? []).map((diagnostic) => ({
      ...diagnostic,
      file: isAbsolute(diagnostic.file)
        ? relative(directory, diagnostic.file)
        : diagnostic.file.replace(/^\.\//, ''),
      message: diagnostic.message.split(join(directory, '/')).join(''),
    })),
    parseDiagnostics: (scan.parseDiagnostics ?? []).map((diagnostic) => ({
      ...diagnostic,
      file: isAbsolute(diagnostic.file)
        ? relative(directory, diagnostic.file)
        : diagnostic.file.replace(/^\.\//, ''),
      message: diagnostic.message.split(join(directory, '/')).join(''),
    })),
    findings: scan.findings.map((finding) => ({
      ...finding,
      file: isAbsolute(finding.file)
        ? relative(directory, finding.file)
        : finding.file.replace(/^\.\//, ''),
    })),
  };
}

function ambiguousSnippet(finding: SecurityFinding): boolean {
  return (
    finding.snippet === undefined ||
    finding.snippet.trim() === '' ||
    finding.snippetTruncated === true
  );
}

/** Only identical diagnostics on unchanged source qualify as known coverage gaps. */
export async function compareParseCoverage(input: {
  base: SarifParseResult;
  worktree: SarifParseResult;
  baseDirectory: string;
  target: string;
  diff: (file: string) => Promise<string>;
  pinnedEntry: (file: string) => Promise<string>;
}): Promise<{ errors: string[]; unscannedCoverage: string[] }> {
  const base = coverageDiagnostics(input.base);
  const worktree = coverageDiagnostics(input.worktree);
  const files = [...new Set([...base, ...worktree].map((diagnostic) => diagnostic.file))].sort();
  const errors: string[] = [];
  const unscannedCoverage: string[] = [];
  // Measured scans with no file diagnostics have no tolerated coverage gaps.
  if (files.length === 0) return { errors, unscannedCoverage };
  for (const file of files) {
    if (outsideTree(file)) {
      errors.push(`Coverage diagnostic path outside scanned tree: ${JSON.stringify(file)}`);
      continue;
    }
    if (diagnosticIdentities(base, file) !== diagnosticIdentities(worktree, file)) {
      errors.push(`New or changed coverage diagnostics: ${file}`);
      continue;
    }
    try {
      if (!(await unchangedFile(input, file))) {
        errors.push(`Change touches unscanned file: ${file}`);
      } else {
        unscannedCoverage.push(describeUnscanned(file, worktree));
      }
    } catch (error: unknown) {
      errors.push(
        `Cannot verify unscanned file ${file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { errors, unscannedCoverage };
}

type CoverageDiagnostic = ScannerParseDiagnostic | ScannerFileDiagnostic;

function coverageDiagnostics(scan: SarifParseResult): CoverageDiagnostic[] {
  return [...(scan.parseDiagnostics ?? []), ...(scan.scannerDiagnostics ?? [])];
}

function diagnosticIdentities(diagnostics: readonly CoverageDiagnostic[], file: string): string {
  return JSON.stringify(
    diagnostics
      .filter((d) => d.file === file)
      .map((d) =>
        JSON.stringify('scanner' in d ? [d.scanner, d.kind, d.rule] : [d.kind, d.message])
      )
      .sort()
  );
}

function describeUnscanned(file: string, diagnostics: readonly CoverageDiagnostic[]): string {
  const failures = diagnostics.filter((d) => d.file === file && 'scanner' in d);
  if (failures.length === 0) return file; // Existing parse-only coverage gaps retain their path.
  return `${file}: ${failures
    .map((d) =>
      'scanner' in d ? `${d.scanner} ${d.rule ?? '(no rule)'} (${d.kind}): ${d.message}` : ''
    )
    .join('; ')}`;
}

/** Shared parse/scanner-gap identity: pinned blob and Git mode, never a similar base file. */
async function unchangedFile(
  input: Parameters<typeof compareParseCoverage>[0],
  file: string
): Promise<boolean> {
  const [oldPath, newPath, entry, diff] = await Promise.all([
    confinedFile(input.baseDirectory, file),
    confinedFile(input.target, file),
    input.pinnedEntry(file),
    input.diff(file),
  ]);
  const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(entry);
  if (match?.[3] !== file || diff !== '') return false;
  const [oldBytes, newBytes, oldStat, newStat] = await Promise.all([
    readFile(oldPath),
    readFile(newPath),
    lstat(oldPath),
    lstat(newPath),
  ]);
  const mode = (stat: typeof oldStat): string => ((stat.mode & 0o111) === 0 ? '100644' : '100755');
  const hash = match[2];
  if (hash === undefined || !oldStat.isFile() || !newStat.isFile()) return false;
  const digest = (bytes: Buffer): string =>
    createHash(hash.length === 64 ? 'sha256' : 'sha1')
      .update(`blob ${String(bytes.length)}\0`)
      .update(bytes)
      .digest('hex');
  return (
    mode(oldStat) === match[1] &&
    mode(newStat) === match[1] &&
    digest(oldBytes) === hash &&
    digest(newBytes) === hash
  );
}

/** Reject symlinks (including parent components) and escapes before reading either tree. */
async function confinedFile(root: string, file: string): Promise<string> {
  const path = join(root, file);
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  if (relative(canonicalRoot, canonicalPath) !== file || !(await lstat(path)).isFile())
    throw new Error(`Unverifiable file path: ${file}`);
  return path;
}

function outsideTree(file: string): boolean {
  return (
    file === '' ||
    hasControlCharacter(file) ||
    file.includes('\\') ||
    isAbsolute(file) ||
    file.split('/').includes('..') ||
    /^[a-z]+:/i.test(file)
  );
}
