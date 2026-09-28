/**
 * Tests for the release.yml publish-smoke decision (#6790, #6804).
 *
 * The script runs for real: bash, git, jq and sort are the real tools. Only
 * `pnpm` (the pending-changeset count) and `npm` (the registry lookup) are
 * stubbed, by putting fakes first on PATH. Those are the two network or
 * workspace boundaries.
 *
 * @module scripts/decide-publish-smoke.test
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = resolve(__dirname, 'decide-publish-smoke.sh');

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

interface Scenario {
  /** Committed versions at the fixture's HEAD. */
  readonly local: { readonly agents: string; readonly memory: string };
  /** What `npm view <pkg> version` prints; `null` makes that lookup fail. */
  readonly npm: { readonly agents: string | null; readonly memory: string | null };
  /** What the pending-changeset counter prints. */
  readonly pending?: number;
}

interface Decision {
  readonly status: number | null;
  readonly stdout: string;
  readonly outputs: Record<string, string>;
}

/** Writes an executable bash stub. */
function stub(path: string, body: string): void {
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`, 'utf-8');
  chmodSync(path, 0o755);
}

/** Runs the decision script against a throwaway repo and stubbed pnpm/npm. */
function decide(scenario: Scenario): Decision {
  const root = mkdtempSync(join(tmpdir(), 'publish-decision-'));
  created.push(root);
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const [pkg, version] of [
    ['nexus-agents', scenario.local.agents],
    ['nexus-memory', scenario.local.memory],
  ] as const) {
    mkdirSync(join(repo, 'packages', pkg), { recursive: true });
    writeFileSync(
      join(repo, 'packages', pkg, 'package.json'),
      JSON.stringify({ name: pkg, version })
    );
  }
  const git = (...args: string[]): string =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('add', '-A');
  git('commit', '-qm', 'fixture');
  const sha = git('rev-parse', 'HEAD').trim();

  // The stub insists on the exact invocation, so a script that stopped
  // counting at the given sha fails here rather than passing silently.
  stub(
    join(bin, 'pnpm'),
    `[ "$*" = "exec tsx scripts/count-pending-changesets.ts ${sha}" ] || { echo "unexpected pnpm $*" >&2; exit 97; }\n` +
      `echo ${String(scenario.pending ?? 0)}`
  );
  const npmCase = (pkg: string, version: string | null): string =>
    version === null ? `  ${pkg}) exit 1 ;;` : `  ${pkg}) echo '${version}' ;;`;
  stub(
    join(bin, 'npm'),
    [
      '[ "$1" = view ] && [ "$3" = version ] || { echo "unexpected npm $*" >&2; exit 97; }',
      'case "$2" in',
      npmCase('nexus-agents', scenario.npm.agents),
      npmCase('nexus-memory', scenario.npm.memory),
      '  *) exit 98 ;;',
      'esac',
    ].join('\n')
  );

  const outputFile = join(root, 'github-output');
  writeFileSync(outputFile, '');
  const run = spawnSync('bash', [SCRIPT, sha], {
    cwd: repo,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env['PATH'] ?? ''}`,
      GITHUB_OUTPUT: outputFile,
    },
  });
  const outputs: Record<string, string> = {};
  for (const line of readFileSync(outputFile, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) outputs[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return { status: run.status, stdout: run.stdout, outputs };
}

describe('decide-publish-smoke.sh', () => {
  it('publishes when nexus-agents is ahead of npm', () => {
    const result = decide({
      local: { agents: '8.105.0', memory: '1.4.0' },
      npm: { agents: '8.104.4', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'true', memory_ahead: 'false' });
  });

  it('publishes and smokes memory when only nexus-memory is ahead', () => {
    const result = decide({
      local: { agents: '8.104.4', memory: '1.5.0' },
      npm: { agents: '8.104.4', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'true', memory_ahead: 'true' });
  });

  it('does not publish when both packages equal npm', () => {
    const result = decide({
      local: { agents: '8.104.4', memory: '1.4.0' },
      npm: { agents: '8.104.4', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'false', memory_ahead: 'false' });
    expect(result.stdout).toContain('nothing new to publish');
  });

  it('does not publish while non-empty changesets are pending, even with a package ahead', () => {
    const result = decide({
      local: { agents: '8.105.0', memory: '1.5.0' },
      npm: { agents: '8.104.4', memory: '1.4.0' },
      pending: 2,
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'false', memory_ahead: 'false' });
    expect(result.stdout).toContain('2 non-empty changeset(s) pending');
  });

  it('fails, writing no decision, when an npm lookup fails', () => {
    // A failed lookup is unmeasured (#4927). The memory lookup fails AFTER
    // nexus-agents measured as ahead, so a script that skipped the smoke on
    // any failure, or kept the half-made decision, would show here.
    const result = decide({
      local: { agents: '8.105.0', memory: '1.4.0' },
      npm: { agents: '8.104.4', memory: null },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('::error::npm view nexus-memory version failed');
    expect(result.outputs).toEqual({});
  });

  it('fails when npm answers with an empty version', () => {
    const result = decide({
      local: { agents: '8.105.0', memory: '1.4.0' },
      npm: { agents: '', memory: '1.4.0' },
    });
    expect(result.status).toBe(1);
    expect(result.outputs).toEqual({});
  });

  it('publishes a pre-release committed ahead of the npm release', () => {
    const result = decide({
      local: { agents: '8.105.0-rc.0', memory: '1.4.0' },
      npm: { agents: '8.104.4', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'true', memory_ahead: 'false' });
  });

  it('compares numerically: 8.104.10 is ahead of 8.104.9', () => {
    // A lexical sort puts 8.104.9 last and would call this "not ahead".
    const result = decide({
      local: { agents: '8.104.10', memory: '1.4.0' },
      npm: { agents: '8.104.9', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'true', memory_ahead: 'false' });
  });

  it('compares numerically: 8.104.9 is behind 8.104.10', () => {
    const result = decide({
      local: { agents: '8.104.9', memory: '1.4.0' },
      npm: { agents: '8.104.10', memory: '1.4.0' },
    });
    expect(result.status).toBe(0);
    expect(result.outputs).toEqual({ will_publish: 'false', memory_ahead: 'false' });
  });
});
