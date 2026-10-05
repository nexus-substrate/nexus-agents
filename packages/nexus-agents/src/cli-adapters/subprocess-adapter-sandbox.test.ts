/** Scratch CLI startup configuration is executed inside the sandbox (#7011). */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBwrapPreflight } from './codex-sandbox-preflight.js';
import { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';
import type { ICliResponseParser, ModelInfo } from './types.js';
import { createScratchSandbox } from '../pipeline/dev-pipeline-sandbox.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';

const isolation = await createBwrapPreflight()();
if (isolation.mode !== 'os-sandbox')
  console.warn(`Skipping real CLI sandbox test: ${isolation.reason ?? 'unavailable'}`);

/** Fixture CLI reads startup configuration before producing its response. */
class StartupProbeAdapter extends SubprocessCliAdapter {
  readonly name = 'claude' as const;
  readonly version = '1.0.0';
  protected override readonly transientRetry = { enabled: false };
  protected readonly parser: ICliResponseParser = {
    name: 'fixture',
    supportedVersionRange: '>=1.0.0',
    parse: (raw) => raw,
    extractResponse: (output) => output,
    extractUsage: () => null,
    extractSessionId: () => null,
  };
  protected getCommand(): CommandConfig {
    return { command: process.execPath, args: ['startup.cjs'] };
  }
  getModelInfo(): ModelInfo {
    return {
      id: 'fixture',
      name: 'Fixture',
      contextWindow: 1000,
      maxOutput: 100,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }
}

afterEach(() => vi.unstubAllEnvs());

describe('scratch model subprocess confinement', () => {
  it.skipIf(isolation.mode !== 'os-sandbox')(
    'confines startup hooks from writable configuration',
    async () => {
      const fixture = mkdtempOutsideRepo('cli-startup-sandbox-');
      const source = join(fixture, 'source');
      const scratch = join(fixture, 'scratch');
      const tempRoot = join(fixture, 'tmp');
      for (const path of [source, scratch, tempRoot]) mkdirSync(path);
      vi.stubEnv('NEXUS_TMPDIR', tempRoot);
      const sourceFile = join(source, 'original');
      const marker = join(source, 'host-marker');
      const attempted = join(scratch, 'hook-attempted');
      writeFileSync(sourceFile, 'unchanged');
      execFileSync('git', ['-c', 'core.fsmonitor=false', 'init', scratch], {
        env: hermeticGitEnv(),
        timeout: 10_000,
        stdio: 'pipe',
      });
      writeFileSync(
        join(scratch, 'startup.cjs'),
        `
      const fs = require('node:fs');
      const config = JSON.parse(fs.readFileSync('startup.json', 'utf8'));
      require('node:child_process').execFileSync(process.execPath, [config.hook]);
      process.stdout.write('reviewed');
    `
      );
      writeFileSync(join(scratch, 'startup.json'), '{"hook":"hook.cjs"}');
      writeFileSync(
        join(scratch, 'hook.cjs'),
        `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(attempted)}, 'attempted');
      try {
        fs.writeFileSync(${JSON.stringify(marker)}, 'escaped');
        fs.writeFileSync(${JSON.stringify(sourceFile)}, 'changed');
      } catch {}
    `
      );
      const sandbox = await createScratchSandbox(scratch, source);
      const adapter = new StartupProbeAdapter();
      try {
        const result = await adapter.execute(
          {
            content: 'review the fixture',
            options: { workDir: scratch },
            wrapper: sandbox.wrapper,
          },
          { timeoutMs: 5000, allowRetry: false }
        );
        expect(result.ok).toBe(true);
        expect(existsSync(attempted), 'the startup hook executed').toBe(true);
        expect(existsSync(marker), 'the hook cannot write a host marker').toBe(false);
        expect(readFileSync(sourceFile, 'utf8')).toBe('unchanged');
      } finally {
        await adapter.dispose();
        sandbox.dispose();
        rmSync(fixture, { recursive: true, force: true });
      }
    }
  );
});
