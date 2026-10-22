/** Actual workflow shell bodies, with offline command-boundary recorders only. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { ROOT } from './script-paths.js';

const StepSchema = z.object({
  name: z.string().optional(),
  uses: z.string().optional(),
  if: z.string().optional(),
  run: z.string().optional(),
  env: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
type Step = z.infer<typeof StepSchema>;
const WorkflowSchema = z.object({
  jobs: z.record(z.string(), z.object({ steps: z.array(StepSchema) })),
});
const ActionSchema = z.object({ runs: z.object({ steps: z.array(StepSchema) }) });
const ACTION = '.github/actions/describe-pr/action.yml';
const SOAK = '.github/workflows/meta-shadow-soak.yml';
const NPM = '.github/workflows/npm-verify.yml';
const RELEASE = '.github/workflows/release.yml';
const SICA = '.github/workflows/sica-test-generation.yml';
const COUNT = "${{ inputs.count || '12' }}";
const REPO = "${{ inputs.repo != '' && inputs.repo || github.repository }}";
const VERSION = "${{ github.event.inputs.version || 'latest' }}";
// This text is ONLY env data, never rendered into shell source.
const LITERAL = 'FAKE data "quotes" $(FAKE_COMMAND) `FAKE_COMMAND`; * %s\\n\nsecond line';

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}
function steps(path: string, job: string): Step[] {
  const parsed: unknown = parse(source(path));
  if (path === ACTION) return ActionSchema.parse(parsed).runs.steps;
  const selected = WorkflowSchema.parse(parsed).jobs[job];
  if (selected === undefined) throw new Error(`Missing job ${job}`);
  return selected.steps;
}
function exactStep(list: Step[], name: string): Step & { run: string } {
  const matches = list.filter((step) => step.name === name);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one ${name}; got ${String(matches.length)}`);
  const step = matches[0];
  if (step?.run === undefined) throw new Error(`Missing run body for ${name}`);
  return { ...step, run: step.run };
}
function target(path: string, job: string, name: string): Step & { run: string } {
  return exactStep(steps(path, job), name);
}
function noRaw(step: Step & { run: string }, expressions: string[]): void {
  for (const expression of expressions) expect(step.run).not.toContain(expression);
}

// Render ONLY explicit trusted platform numeric/enumeration fixtures. Any other
// expression aborts before Bash sees the body; test data never enters the source.
function platformBody(body: string, bindings: Readonly<Record<string, string>> = {}): string {
  const rendered = body.replace(/\$\{\{[^}]+\}\}/g, (expression) => {
    const value = bindings[expression];
    if (
      value === undefined ||
      !/^(?:\d+|success|failure|skipped|true|false|ignore-scripts)$/.test(value)
    ) {
      throw new Error(`Unbound platform expression: ${expression}`);
    }
    return value;
  });
  return rendered;
}

function offlineShell(
  body: string,
  env: Readonly<Record<string, string>>
): {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[][];
  summary: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-shell-'));
  const calls = join(dir, 'calls.jsonl');
  const summary = join(dir, 'summary.md');
  // Absolute interpreter; PATH contains only recorders, never the user's tools.
  const recorder = `#!${process.execPath}\nconst fs = require('node:fs');\nconst path = require('node:path');\nconst command = path.basename(process.argv[1]);\nfs.appendFileSync(process.env.CALLS, JSON.stringify([command, ...process.argv.slice(2)]) + '\\n');\nif (command === 'gh') process.stdout.write('abcdefghij');\nif (command === 'wc') process.stdout.write('10\\n');\nif (command === 'head') process.stdout.write('abc');\nif (command === 'mv') fs.renameSync(process.argv[2], process.argv[3]);\n`;
  for (const command of ['gh', 'pnpm', 'docker', 'mkdir', 'wc', 'head', 'mv']) {
    writeFileSync(join(dir, command), recorder, { mode: 0o700 });
  }
  writeFileSync(calls, '');
  try {
    // Relocate the action's fixed /tmp files only, avoiding shared /tmp writes.
    const isolated = body.replaceAll('/tmp/pr-diff', `${dir}/pr-diff`);
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', isolated],
      {
        cwd: dir,
        env: { PATH: dir, CALLS: calls, GITHUB_STEP_SUMMARY: summary, ...env },
        encoding: 'utf8',
        timeout: 10000,
      }
    );
    if (result.error !== undefined) throw result.error;
    const recorded = readFileSync(calls, 'utf8').trim();
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls:
        recorded === ''
          ? []
          : recorded
              .split('\n')
              .map((line) => z.array(z.string()).parse(JSON.parse(line) as unknown)),
      summary: (() => {
        try {
          return readFileSync(summary, 'utf8');
        } catch {
          return '';
        }
      })(),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TARGETS = [
  [ACTION, '', 'Get PR diff'],
  [SOAK, 'soak', 'Run shadow-training soak'],
  [NPM, 'verify-published-latest', 'Run smoke test'],
  [RELEASE, 'manual-publish', 'Guard — main only'],
  [SICA, 'generate-tests', 'Post Summary'],
] as const;

// Imports were audited: meta-shadow-soak's main guard is false on import;
// run-tool exports schemas/functions, and learning paths are lazy getters.
// A separate child blocks network/provider process boundaries before importing
// the actual exported consumer, so import side effects fail rather than call out.
function actualSoakArguments(cases: readonly (readonly string[])[]): unknown {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-parser-'));
  const probe = `
    import { syncBuiltinESMExports } from 'node:module';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import tls from 'node:tls';
    import childProcess from 'node:child_process';
    let boundaryAttempts = 0;
    const blocked = () => { boundaryAttempts++; throw new Error('Unexpected provider/network/process boundary'); };
    http.request = http.get = https.request = https.get = blocked;
    net.connect = net.createConnection = tls.connect = blocked;
    net.Socket.prototype.connect = blocked;
    globalThis.fetch = blocked;
    // tsx may start its own local esbuild transformer; all task CLI execution
    // stays blocked. No gh/npm/Docker/provider command can pass this boundary.
    for (const key of ['exec', 'execSync', 'execFile', 'execFileSync', 'fork', 'spawnSync']) childProcess[key] = blocked;
    const originalSpawn = childProcess.spawn;
    childProcess.spawn = (file, args, options) => {
      if (!file.endsWith('/esbuild') || !args.some(arg => arg.startsWith('--service='))) return blocked();
      return originalSpawn(file, args, options);
    };
    syncBuiltinESMExports();
    const { parseArgs } = await import(process.env.MODULE_URL);
    if (boundaryAttempts !== 0) throw new Error('Import caught a forbidden boundary attempt');
    console.log('PARSED:' + JSON.stringify(JSON.parse(process.env.CASES).map(args => parseArgs(args))));
  `;
  try {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
        '--input-type=module',
        '-e',
        probe,
      ],
      {
        cwd: dir,
        env: {
          PATH: dir,
          HOME: dir,
          NEXUS_DATA_DIR: dir,
          NEXUS_PERSIST_LEARNING: '0',
          NEXUS_GITIGNORE_AUTO: '0',
          NEXUS_REPO_PREFERRED: '0',
          MODULE_URL: pathToFileURL(join(ROOT, 'scripts/meta-shadow-soak.ts')).href,
          CASES: JSON.stringify(cases),
        },
        encoding: 'utf8',
        timeout: 30000,
      }
    );
    if (result.error !== undefined) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    const line = result.stdout.split('\n').find((value) => value.startsWith('PARSED:'));
    if (line === undefined) throw new Error('Actual parseArgs emitted no result');
    return JSON.parse(line.slice('PARSED:'.length)) as unknown;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('workflow shell input transport', () => {
  it.each(TARGETS)('rejects missing and duplicate targets in %s', (path, job, name) => {
    const list = steps(path, job);
    const selected = exactStep(list, name);
    expect(() =>
      exactStep(
        list.filter((step) => step.name !== name),
        name
      )
    ).toThrow('got 0');
    expect(() => exactStep([...list, selected], name)).toThrow('got 2');
  });

  it('preserves actual soak parser defaults and positive parseInt prefixes', () => {
    const counts = ['', '12suffix', '2.5', 'nonnumeric', '0', '-1', '50001'];
    const step = target(SOAK, 'soak', 'Run shadow-training soak');
    noRaw(step, [COUNT, REPO]);
    const emitted = counts.map((value) => {
      const result = offlineShell(platformBody(step.run), {
        SOAK_COUNT: value,
        SOAK_REPO: LITERAL,
        NEXUS_DATA_DIR: '/FAKE data',
      });
      expect(result.status).toBe(0);
      const call = result.calls.find((entry) => entry[0] === 'pnpm');
      if (call === undefined) throw new Error('Actual soak body never invoked its consumer');
      return call.slice(4);
    });
    expect(actualSoakArguments([[], ...emitted])).toEqual([
      { repo: 'nexus-substrate/nexus-agents', count: 12 },
      ...[12, 12, 2, 12, 12, 12, 50001].map((count) => ({ repo: LITERAL, count })),
    ]);
  });

  it('pins the existing SICA generator numeric consumer without running providers', () => {
    expect(source(SICA)).toContain(
      "const targetCoverage = parseInt(process.env.TARGET_COVERAGE || '85', 10);"
    );
    // Native parseInt oracle only; this does not claim to execute the generator.
    expect(
      ['', '85suffix', '2.5', '0', '-1', '101'].map((value) => parseInt(value || '85', 10))
    ).toEqual([85, 85, 2, 0, -1, 101]);
    expect(Number.isNaN(parseInt('nonnumeric', 10))).toBe(true);
  });

  it('preserves dispatch gating, permissions, defaults and six install modes', () => {
    expect(parse(source(SOAK)) as unknown).toMatchObject({
      on: { workflow_dispatch: { inputs: { count: { default: '12' }, repo: { default: '' } } } },
      permissions: { contents: 'read', issues: 'read' },
      jobs: {
        soak: {
          env: {
            NEXUS_META_SHADOW_TRAIN: '1',
            NEXUS_GITIGNORE_AUTO: '0',
            NEXUS_REPO_PREFERRED: '0',
          },
        },
      },
    });
    const soakDoc = z
      .object({ on: z.record(z.string(), z.unknown()) })
      .parse(parse(source(SOAK)) as unknown);
    expect(Object.keys(soakDoc.on)).toEqual(['workflow_dispatch']);
    expect(target(SOAK, 'soak', 'Check for model-gateway secrets').run).toContain('has_key=false');
    expect(parse(source(NPM)) as unknown).toMatchObject({
      permissions: { contents: 'read' },
      jobs: {
        'verify-from-source': {
          if: "github.event_name == 'pull_request' || github.event_name == 'push'",
        },
        'verify-published-latest': {
          if: "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'",
          strategy: {
            matrix: {
              install_mode: [
                'ignore-scripts',
                'default',
                'npm12',
                'npm12-strict',
                'update',
                'pnpm',
              ],
            },
          },
        },
      },
    });
    expect(parse(source(RELEASE)) as unknown).toMatchObject({
      permissions: 'read-all',
      jobs: {
        'manual-publish': {
          if: "github.event_name == 'workflow_dispatch'",
          permissions: { contents: 'read', 'id-token': 'write' },
        },
      },
    });
    expect(source(SICA)).toContain("github.event.inputs.dry_run != 'true'");
    expect(source(RELEASE)).toContain('if: ${{ inputs.dry_run != true }}');
  });

  it('describe-pr keeps max size as quoted environment data', () => {
    const step = target(ACTION, '', 'Get PR diff');
    noRaw(step, ['${{ inputs.max-diff-size }}']);
    expect(step.env?.MAX_SIZE).toBe('${{ inputs.max-diff-size }}');
    expect(step.run).toContain('[ "$DIFF_SIZE" -gt "$MAX_SIZE" ]');
    expect(step.run).toContain('head -c "$MAX_SIZE"');
    expect(parse(source(ACTION))).toMatchObject({
      inputs: { 'max-diff-size': { default: '50000' } },
    });
    const body = platformBody(step.run, { '${{ github.event.pull_request.number }}': '123' });
    for (const size of ['50000', '3', '12suffix', '2.5', '0', '-1', '', LITERAL]) {
      const result = offlineShell(body, { MAX_SIZE: size });
      expect(result.status).toBe(0);
      expect(result.calls[0]).toEqual(['gh', 'pr', 'diff', '123']);
      if (['3', '0', '-1'].includes(size)) {
        expect(result.calls.find((call) => call[0] === 'head')?.slice(0, 3)).toEqual([
          'head',
          '-c',
          size,
        ]);
      } else {
        expect(result.calls.find((call) => call[0] === 'head')).toBeUndefined();
      }
      if (['12suffix', '2.5', '', LITERAL].includes(size))
        expect(result.stderr).toMatch(/integer (?:expression )?expected/);
    }
  });

  it('soak keeps count and repository as separate opaque argv', () => {
    const step = target(SOAK, 'soak', 'Run shadow-training soak');
    noRaw(step, [COUNT, REPO]);
    expect(step.env).toMatchObject({ SOAK_COUNT: COUNT, SOAK_REPO: REPO });
    expect(step.if).toBe("steps.check.outputs.has_key == 'true'");
    const result = offlineShell(platformBody(step.run), {
      SOAK_COUNT: LITERAL,
      SOAK_REPO: LITERAL,
      NEXUS_DATA_DIR: '/FAKE data',
    });
    expect(result.status).toBe(0);
    expect(result.calls).toContainEqual([
      'pnpm',
      'exec',
      'tsx',
      'scripts/meta-shadow-soak.ts',
      '--count',
      LITERAL,
      '--repo',
      LITERAL,
    ]);
  });

  it('npm verification keeps version tags and tarballs as one opaque argv', () => {
    const step = target(NPM, 'verify-published-latest', 'Run smoke test');
    noRaw(step, [VERSION]);
    expect(step.env?.VERIFY_VERSION).toBe(VERSION);
    const body = platformBody(step.run, { '${{ matrix.install_mode }}': 'ignore-scripts' });
    for (const version of ['latest', 'next', './tar ball.tgz', '', LITERAL]) {
      const result = offlineShell(body, { VERIFY_VERSION: version });
      expect(result.status).toBe(0);
      expect(result.calls).toEqual([
        [
          'docker',
          'run',
          '--rm',
          '-e',
          'NEXUS_VERIFY_INSTALL_MODE=ignore-scripts',
          'nexus-verify',
          'bash',
          '/home/verifier/verify.sh',
          version,
        ],
      ]);
    }
  });

  it('release rejects non-main first and prints ref as literal data', () => {
    const list = steps(RELEASE, 'manual-publish');
    const step = exactStep(list, 'Guard — main only');
    noRaw(step, ['${{ github.ref }}']);
    expect(step.env?.PUBLISH_REF).toBe('${{ github.ref }}');
    expect(step.if).toBe("github.ref != 'refs/heads/main'");
    expect(list[0]).toEqual(step);
    expect(list[1]?.uses).toMatch(/^actions\/checkout@/);
    const result = offlineShell(platformBody(step.run), { PUBLISH_REF: LITERAL });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.stdout).toContain(`got '${LITERAL}'.`);
    expect(result.stdout).toContain('Re-run with --ref main.');
  });

  it('SICA summary keeps inherited coverage as literal data and reports outcomes', () => {
    const step = target(SICA, 'generate-tests', 'Post Summary');
    noRaw(step, ['${{ env.TARGET_COVERAGE }}']);
    expect(step.if).toBe('always()');
    expect(step.run).toContain(
      'printf \'**Target Coverage:** %s%%\\n\' "$TARGET_COVERAGE" >> "$GITHUB_STEP_SUMMARY"'
    );
    expect(parse(source(SICA))).toMatchObject({
      env: { TARGET_COVERAGE: "${{ github.event.inputs.target_coverage || '85' }}" },
    });
    for (const [generate, validate, dry, pr, count, message] of [
      ['failure', 'skipped', 'false', 'skipped', '0', 'Generator failed'],
      ['success', 'failure', 'false', 'skipped', '2', 'FAILED validation'],
      ['success', 'success', 'true', 'skipped', '2', 'Dry run'],
      ['success', 'success', 'false', 'success', '2', 'PR created'],
      ['success', 'success', 'false', 'failure', '2', 'PR creation did not succeed'],
      ['success', 'success', 'false', 'skipped', '0', 'No tests generated'],
    ]) {
      const bindings = {
        '${{ github.run_number }}': '123',
        '${{ steps.coverage.outputs.line_coverage }}': '80',
        '${{ steps.coverage.outputs.branch_coverage }}': '70',
        '${{ steps.coverage.outputs.function_coverage }}': '90',
        '${{ steps.generate.outputs.test_count || 0 }}': count ?? '0',
        '${{ steps.generate.outputs.coverage_gain || 0 }}': '0',
        '${{ steps.generate.outcome }}': generate ?? 'failure',
        '${{ steps.validate.outcome }}': validate ?? 'skipped',
        '${{ github.event.inputs.dry_run }}': dry ?? 'false',
        '${{ steps.pr.outcome }}': pr ?? 'skipped',
      };
      const result = offlineShell(platformBody(step.run, bindings), { TARGET_COVERAGE: LITERAL });
      expect(result.status, result.stderr).toBe(0);
      expect(result.summary).toContain(`**Target Coverage:** ${LITERAL}%`);
      expect(result.summary).toContain(message);
      expect(result.calls).toEqual([]);
    }
  });
});
