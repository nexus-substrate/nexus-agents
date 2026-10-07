import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeSecurityScan, prepareSecurityScan } from './security-scan.js';

const available = spawnSync('semgrep', ['--version'], { timeout: 10_000 }).status === 0;

describe.skipIf(!available)(
  'complete scanner coverage in hidden scratch directories (#7238)',
  () => {
    let directory: string;
    let target: string;
    let rules: string;

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'semgrep-coverage-'));
      target = join(directory, '.hidden-source');
      await mkdir(target);
      rules = join(directory, 'rule.yaml');
      await writeFile(
        rules,
        'rules:\n- id: eval\n  pattern-regex: eval\\(\n  languages: [generic]\n  message: unsafe eval\n  severity: ERROR\n'
      );
      await writeFile(join(target, 'app.ts'), 'eval("unsafe");\n');
      await writeFile(join(target, '.semgrepignore'), '*\n');
    });

    afterAll(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('measures a known finding despite hidden ancestors and mutable ignore files', async () => {
      const prepared = await prepareSecurityScan([rules], { directory });
      expect('error' in prepared).toBe(false);
      if ('error' in prepared) return;
      const result = await executeSecurityScan(
        { target, scanner: 'semgrep', rulesets: [rules], maxFindings: 1 },
        { root: target, completeResults: true, preparedScan: prepared }
      );
      expect('error' in result).toBe(false);
      if ('error' in result) return;
      expect(result.coverageComplete).toBe(true);
      expect(result.totalFindings).toBe(1);
      expect(result.findings[0]?.rule).toBe('eval');
    }, 30_000);
  }
);
