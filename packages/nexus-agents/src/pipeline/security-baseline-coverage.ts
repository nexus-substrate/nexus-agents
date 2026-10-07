/** Coverage evidence for the pinned security comparison (#7238). */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { SarifParseResult, SecurityFinding } from '../security/sarif-types.js';

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
}): Promise<{ errors: string[]; unscannedCoverage: string[] }> {
  const base = input.base.parseDiagnostics ?? [];
  const worktree = input.worktree.parseDiagnostics ?? [];
  const files = [...new Set([...base, ...worktree].map((diagnostic) => diagnostic.file))].sort();
  const errors: string[] = [];
  const unscannedCoverage: string[] = [];
  for (const file of files) {
    if (outsideTree(file)) {
      errors.push(`Parse diagnostic path outside scanned tree: ${file}`);
      continue;
    }
    const identities = (diagnostics: typeof base): string =>
      JSON.stringify(
        diagnostics
          .filter((d) => d.file === file)
          .map(({ kind, message }) => JSON.stringify([kind, message]))
          .sort()
      );
    if (identities(base) !== identities(worktree)) {
      errors.push(`New or changed parse diagnostics: ${file}`);
      continue;
    }
    try {
      const [oldBytes, newBytes, diff] = await Promise.all([
        readFile(join(input.baseDirectory, file)),
        readFile(join(input.target, file)),
        input.diff(file),
      ]);
      if (!oldBytes.equals(newBytes) || diff !== '') {
        errors.push(`Change touches partially parsed file: ${file}`);
      } else unscannedCoverage.push(file);
    } catch (error: unknown) {
      errors.push(
        `Cannot verify partially parsed file ${file}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { errors, unscannedCoverage };
}

function outsideTree(file: string): boolean {
  return isAbsolute(file) || file.split('/').includes('..') || /^[a-z]+:/i.test(file);
}
