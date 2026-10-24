import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const diagnosticWrite = vi.hoisted(() => vi.fn());
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  writeSync: diagnosticWrite,
}));

import { emitDiagnostic } from './release-publish.js';

import { ROOT } from './script-paths.js';

interface PublisherRecord {
  args: string[];
  nodeOptions: string;
  logsDir: string | null;
  logsMax: string | null;
  logsDirExisted: boolean;
}

const directories: string[] = [];
const DIAGNOSTIC_PREFIX = 'publish-diagnostics: ';

/** Exercise the real wrapper with an inert, credential-free publisher child. */
function runPublisher(
  args: string[],
  exit: number | 'signal' = 0
): SpawnSyncReturns<string> & { record: PublisherRecord } {
  const dir = mkdtempSync(join(tmpdir(), 'publish-diagnostics-wrapper-'));
  directories.push(dir);
  const record = join(dir, 'record.json');
  const executable = join(dir, 'pnpm');
  writeFileSync(join(dir, 'user.npmrc'), '');
  writeFileSync(join(dir, 'global.npmrc'), '');
  writeFileSync(
    executable,
    `#!${process.execPath}\n` +
      'import {writeFileSync,existsSync} from "node:fs";\n' +
      'const logsDir=process.env.npm_config_logs_dir??null;\n' +
      'writeFileSync(process.env.SPAWN_RECORD,JSON.stringify({' +
      'args:process.argv.slice(2),nodeOptions:process.env.NODE_OPTIONS,' +
      'logsDir,logsMax:process.env.npm_config_logs_max??null,' +
      'logsDirExisted:logsDir!==null&&existsSync(logsDir)}));\n' +
      'process.stdout.write("synthetic publisher stdout\\n");\n' +
      'process.stderr.write("synthetic publisher stderr\\n");\n' +
      'if(process.env.FAKE_EXIT==="signal")process.kill(process.pid,"SIGTERM");' +
      'else process.exit(Number(process.env.FAKE_EXIT));\n'
  );
  chmodSync(executable, 0o755);
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', join(ROOT, 'scripts/release-publish.ts'), ...args],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        HOME: dir,
        PATH: `${dir}${delimiter}${process.env.PATH ?? ''}`,
        NODE_OPTIONS: '--no-warnings',
        NPM_CONFIG_USERCONFIG: join(dir, 'user.npmrc'),
        NPM_CONFIG_GLOBALCONFIG: join(dir, 'global.npmrc'),
        SPAWN_RECORD: record,
        FAKE_EXIT: String(exit),
      },
    }
  );
  if (result.error !== undefined) throw result.error;
  return { ...result, record: JSON.parse(readFileSync(record, 'utf8')) as PublisherRecord };
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('opt-in publisher diagnostics (#7587)', () => {
  it('leaves default-off child arguments, environment and output unchanged', () => {
    const result = runPublisher(['--tag', 'test']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('synthetic publisher stdout\n');
    expect(result.stderr).toBe('synthetic publisher stderr\n');
    expect(result.record.nodeOptions).toBe('--no-warnings');
    expect(result.record.logsDir).toBeNull();
    expect(result.record.logsMax).toBeNull();
    expect(result.record.args.slice(-3)).toEqual(['publish', '--tag', 'test']);
  });

  it('strips its wrapper-only flag and gives the child an owned logging scope', () => {
    const result = runPublisher(['--diagnostics', '--tag', 'test']);
    expect(result.status).toBe(0);
    expect(result.record.args).not.toContain('--diagnostics');
    expect(result.record.args.slice(-3)).toEqual(['publish', '--tag', 'test']);
    expect(result.record.nodeOptions).toBe('--no-warnings');
    expect(result.record.logsDir).not.toBeNull();
    expect(result.record.logsDirExisted).toBe(true);
    expect(Number(result.record.logsMax)).toBeGreaterThanOrEqual(100);
    expect(existsSync(result.record.logsDir ?? '')).toBe(false);
  });

  it('reports no publisher log as unmeasured while preserving the business result', () => {
    const result = runPublisher(['--diagnostics']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('synthetic publisher stdout\n');
    const line = result.stderr.split('\n').find((value) => value.startsWith(DIAGNOSTIC_PREFIX));
    expect(line).toBeDefined();
    const report = JSON.parse(line?.slice(DIAGNOSTIC_PREFIX.length) ?? 'null') as {
      measurement: string;
      provenance: string;
      attempts: unknown[];
    };
    expect(report.measurement).toBe('unmeasured');
    expect(report.provenance).toBe('npm-debug-self-report');
    expect(report.attempts).toEqual([]);
  });

  it.each([17, 'signal'] as const)('preserves existing failure semantics for %s', (exit) => {
    const before = runPublisher([], exit);
    const observed = runPublisher(['--diagnostics'], exit);
    expect(observed.status).toBe(before.status);
    expect(observed.signal).toBe(before.signal);
    expect(observed.stdout).toBe(before.stdout);
    expect(
      observed.stderr
        .split('\n')
        .filter((line) => !line.startsWith(DIAGNOSTIC_PREFIX))
        .join('\n')
    ).toBe(before.stderr);
  });
});

describe('diagnostic output progress', () => {
  it('emits the complete frame after short writes', () => {
    const chunks: Buffer[] = [];
    diagnosticWrite.mockImplementation(
      (_fd: number, value: string | Buffer, offset: number = 0, length?: number): number => {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const count = Math.min(7, length ?? bytes.length);
        chunks.push(bytes.subarray(offset, offset + count));
        return count;
      }
    );
    emitDiagnostic({ measurement: 'unmeasured', reason: 'collection-unavailable' });
    expect(Buffer.concat(chunks).toString()).toBe(
      'publish-diagnostics: {"measurement":"unmeasured","reason":"collection-unavailable"}\n'
    );
  });

  it('stops when the sink makes no progress', () => {
    diagnosticWrite.mockReset().mockReturnValue(0);
    expect(() => {
      emitDiagnostic({ measurement: 'unmeasured' });
    }).not.toThrow();
    expect(diagnosticWrite).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the diagnostic sink breaks', () => {
    diagnosticWrite.mockReset().mockImplementation(() => {
      throw Object.assign(new Error('synthetic broken pipe'), { code: 'EPIPE' });
    });
    expect(() => {
      emitDiagnostic({ measurement: 'unmeasured' });
    }).not.toThrow();
    expect(diagnosticWrite).toHaveBeenCalledTimes(1);
  });
});
