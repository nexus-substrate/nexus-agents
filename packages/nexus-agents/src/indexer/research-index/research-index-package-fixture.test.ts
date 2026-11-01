/** Regression for #7669: the package runner must execute the real registry checks. */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { findRepoRoot } from '../../config/repo-root-detection.js';

const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const papersPath =
  repoRoot === null ? undefined : join(repoRoot, 'docs/research/registry/papers.yaml');
// An extracted source tree without the populated repository fixture is explicitly unavailable.
const fixtureAvailable =
  papersPath !== undefined &&
  existsSync(papersPath) &&
  readFileSync(papersPath, 'utf8').includes('arxiv-');
const expectedRegistryAssertions = 8;
const childTimeoutMs = 30_000;
const reportSchema = z.object({
  testResults: z.array(
    z.object({
      assertionResults: z.array(
        z.object({ ancestorTitles: z.array(z.string()), fullName: z.string(), status: z.string() })
      ),
    })
  ),
});

describe('real-registry package entrypoint (#7669)', () => {
  it.skipIf(!fixtureAvailable)(
    'executes all populated-registry assertions through the package test runner',
    () => {
      expect(repoRoot).not.toBeNull();
      if (repoRoot === null) throw new Error('Repository fixture root is unavailable');
      const scratch = mkdtempSync(join(tmpdir(), 'registry-package-run-'));
      const reportPath = join(scratch, 'results.json');
      const require = createRequire(import.meta.url);
      const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
      try {
        const child = spawnSync(
          process.execPath,
          [
            vitestCli,
            'run',
            'src/indexer/research-index/research-index.test.ts',
            '--reporter=json',
            `--outputFile=${reportPath}`,
          ],
          {
            cwd: join(repoRoot, 'packages/nexus-agents'),
            env: { HOME: scratch, PATH: process.env['PATH'] ?? '', CI: 'true' },
            encoding: 'utf8',
            timeout: childTimeoutMs,
            maxBuffer: 4 * 1024 * 1024,
          }
        );
        expect(child.error, child.stderr).toBeUndefined();
        expect(child.status, child.stderr).toBe(0);
        const rawReport: unknown = JSON.parse(readFileSync(reportPath, 'utf8'));
        const registryCases = reportSchema
          .parse(rawReport)
          .testResults.flatMap((result) => result.assertionResults)
          .filter((result) => result.ancestorTitles.includes('Integration Tests (Real Registry)'));
        // Empty collection is a failure, never evidence that the integration suite ran.
        expect(registryCases).toHaveLength(expectedRegistryAssertions);
        expect(registryCases.map((result) => result.status)).toEqual(
          Array.from({ length: expectedRegistryAssertions }, () => 'passed')
        );
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    childTimeoutMs + 5_000
  );

  it(
    'fails standalone integration tests when populated fixture is invalid (#7675)',
    () => {
      expect(repoRoot).not.toBeNull();
      if (repoRoot === null) throw new Error('Repository fixture root is unavailable');
      const scratch = mkdtempSync(join(tmpdir(), 'registry-invalid-run-'));
      const fakeRegistry = join(scratch, 'registry');
      const require = createRequire(import.meta.url);
      const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
      try {
        // Create populated fixture containing an invalid record with arxiv- prefix
        const { mkdirSync } = require('node:fs') as typeof import('node:fs');
        mkdirSync(fakeRegistry, { recursive: true });
        writeFileSync(
          join(fakeRegistry, 'papers.yaml'),
          '# Populated registry\n- id: arxiv-2401.12345\n  invalid: [syntax error\n',
          'utf8'
        );

        const child = spawnSync(
          process.execPath,
          [vitestCli, 'run', 'src/indexer/research-index/research-index.test.ts'],
          {
            cwd: join(repoRoot, 'packages/nexus-agents'),
            env: {
              HOME: scratch,
              PATH: process.env['PATH'] ?? '',
              CI: 'true',
              NEXUS_TEST_RESEARCH_REGISTRY_PATH: fakeRegistry,
            },
            encoding: 'utf8',
            timeout: childTimeoutMs,
            maxBuffer: 4 * 1024 * 1024,
          }
        );

        // A populated invalid fixture MUST fail execution (nonzero exit status)
        expect(child.status).not.toBe(0);
        const combinedOutput = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
        expect(combinedOutput).toMatch(/Registry parse failed/);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    childTimeoutMs + 5_000
  );

  it(
    'skips integration tests when registry fixture is genuinely absent (#7675)',
    () => {
      expect(repoRoot).not.toBeNull();
      if (repoRoot === null) throw new Error('Repository fixture root is unavailable');
      const scratch = mkdtempSync(join(tmpdir(), 'registry-absent-run-'));
      const emptyRegistry = join(scratch, 'empty-registry');
      const reportPath = join(scratch, 'results.json');
      const require = createRequire(import.meta.url);
      const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
      try {
        const { mkdirSync } = require('node:fs') as typeof import('node:fs');
        mkdirSync(emptyRegistry, { recursive: true });

        const child = spawnSync(
          process.execPath,
          [
            vitestCli,
            'run',
            'src/indexer/research-index/research-index.test.ts',
            '--reporter=json',
            `--outputFile=${reportPath}`,
          ],
          {
            cwd: join(repoRoot, 'packages/nexus-agents'),
            env: {
              HOME: scratch,
              PATH: process.env['PATH'] ?? '',
              CI: 'true',
              NEXUS_TEST_RESEARCH_REGISTRY_PATH: emptyRegistry,
            },
            encoding: 'utf8',
            timeout: childTimeoutMs,
            maxBuffer: 4 * 1024 * 1024,
          }
        );

        expect(child.status).toBe(0);
        if (existsSync(reportPath)) {
          const rawReport: unknown = JSON.parse(readFileSync(reportPath, 'utf8'));
          const registryCases = reportSchema
            .parse(rawReport)
            .testResults.flatMap((result) => result.assertionResults)
            .filter((result) =>
              result.ancestorTitles.includes('Integration Tests (Real Registry)')
            );
          // In an absent fixture, any reported integration cases must be skipped
          for (const c of registryCases) {
            expect(c.status).toBe('skipped');
          }
        }
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    childTimeoutMs + 5_000
  );
});
