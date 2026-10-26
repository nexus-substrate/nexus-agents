/** Real workflow audit/issue shell bodies with offline pnpm and gh boundaries. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { ROOT } from './script-paths.js';

const require = createRequire(import.meta.url);
const TSX = join(dirname(require.resolve('tsx/package.json')), 'dist/cli.mjs');
const MARKER = 'FAKE_PRIVATE_REGISTRY_DIAGNOSTIC';
const ZERO = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
const report = (counts = ZERO): string => JSON.stringify({ metadata: { vulnerabilities: counts } });
const Step = z.object({ name: z.string().optional(), run: z.string().optional() });
const Job = z.object({
  if: z.string().optional(),
  outputs: z.record(z.string(), z.string()).optional(),
  steps: z.array(Step),
});
const workflow = z
  .object({ jobs: z.record(z.string(), Job) })
  .parse(parse(readFileSync(join(ROOT, '.github/workflows/system-review.yml'), 'utf8')) as unknown);

function body(job: string, name: string): string {
  const result = workflow.jobs[job]?.steps.find((step) => step.name === name)?.run;
  if (result === undefined) throw new Error(`Missing shell body: ${name}`);
  return result;
}

interface Fixture {
  stdout: string;
  exit: number;
  bootstrapFailure?: boolean;
  bootstrapOutput?: string;
  signal?: 'SIGTERM';
}
interface ShellResult {
  output: Record<string, string>;
  summary: string;
  stdout: string;
  stderr: string;
  issueBody: string;
}

function shell(source: string, fixture: Fixture): ShellResult {
  const dir = mkdtempSync(join(tmpdir(), 'system-review-audit-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  const issue = join(dir, 'issue');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  writeFileSync(issue, '');
  writeFileSync(join(dir, 'fixture.json'), JSON.stringify(fixture));
  // The actual runner is executed by Node/tsx. Only the pnpm audit process is
  // replaced, so a successful bootstrap cannot accidentally be a fake audit.
  writeFileSync(
    join(dir, 'pnpm'),
    `#!${process.execPath}\nconst fs=require('node:fs'); const cp=require('node:child_process'); const f=JSON.parse(fs.readFileSync(process.env.FIXTURE,'utf8')); if(process.argv[2]==='exec'&&process.argv[3]==='tsx'){if(f.bootstrapFailure)process.exit(127); if(f.bootstrapOutput!==undefined){process.stdout.write(f.bootstrapOutput);process.exit(0);} const r=cp.spawnSync(${JSON.stringify(process.execPath)},[${JSON.stringify(TSX)},...process.argv.slice(4)],{stdio:'inherit',env:process.env}); process.exit(r.status??125);} if(process.argv.slice(2).join(' ')!=='audit --json')process.exit(126);fs.writeFileSync(1,f.stdout);fs.writeFileSync(2,${JSON.stringify(MARKER)});if(f.signal)process.kill(process.pid,f.signal);else process.exit(f.exit);\n`,
    { mode: 0o700 }
  );
  writeFileSync(
    join(dir, 'gh'),
    `#!${process.execPath}\nconst fs=require('node:fs');const i=process.argv.indexOf('--body');if(i<0)process.exit(126);fs.writeFileSync(process.env.ISSUE_BODY,process.argv[i+1]);\n`,
    { mode: 0o700 }
  );
  try {
    const result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', source],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 20000,
        env: {
          PATH: `${dir}:/usr/bin:/bin`,
          FIXTURE: join(dir, 'fixture.json'),
          ISSUE_BODY: issue,
          RUNNER_TEMP: dir,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
      }
    );
    if (result.error !== undefined) throw result.error;
    expect(result.status, result.stderr).toBe(0);
    return {
      output: Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const at = line.indexOf('=');
            return [line.slice(0, at), line.slice(at + 1)];
          })
      ),
      summary: readFileSync(summary, 'utf8'),
      stdout: result.stdout,
      stderr: result.stderr,
      issueBody: readFileSync(issue, 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function audit(fixture: Fixture): ShellResult {
  return shell(body('run-review', 'Phase 4 - Security Audit'), fixture);
}

function outputs(observation: Record<string, string>): Record<string, string> {
  return {
    registry_implemented: '0',
    registry_planned: '0',
    docs_claude_age: '0',
    docs_arch_age: '0',
    issues_open: '0',
    issues_stale: '0',
    audit_status: observation.status ?? '',
    audit_vulns: observation.vulns ?? '',
    audit_reason: observation.reason ?? '',
    audit_exit_code: observation.exit_code ?? '',
    quality_typecheck: 'Pass',
    quality_lint: 'Pass',
  };
}

/** Evaluate the actual condition over controlled strings, not a claimed GitHub-engine test. */
function issueGate(
  observation: Record<string, string>,
  event = 'schedule',
  createIssue = 'false'
): boolean {
  const condition = workflow.jobs['create-issue']?.if;
  if (condition === undefined) throw new Error('Missing create-issue condition');
  const expression = condition
    .replaceAll('needs.check-trigger', 'needs["check-trigger"]')
    .replaceAll('needs.run-review', 'needs["run-review"]');
  const result: unknown = runInNewContext(expression, {
    needs: {
      'check-trigger': { outputs: { should_run: 'true' } },
      'run-review': { outputs: outputs(observation) },
    },
    github: { event_name: event, event: { inputs: { create_issue: createIssue } } },
    fromJSON: JSON.parse,
  });
  return z.boolean().parse(result);
}

function issueBody(observation: Record<string, string>): string {
  const values = outputs(observation);
  const source = body('create-issue', 'Create System Review Issue')
    .replace(
      /\$\{\{ needs\.run-review\.outputs\.(\w+) \}\}/g,
      (_, key: string) => values[key] ?? ''
    )
    .replace('${{ needs.check-trigger.outputs.trigger_type }}', 'scheduled');
  expect(source).not.toContain('${{');
  return shell(source, { stdout: '', exit: 0 }).issueBody;
}

describe('System Review workflow audit evidence', () => {
  it('measures a complete zero report as clean without filing a scheduled issue', () => {
    const result = audit({ stdout: report(), exit: 0 });
    expect(result.output).toEqual({
      status: 'measured',
      vulns: '0',
      reason: 'none',
      exit_code: '0',
    });
    expect(result.summary).toContain('| Critical | 0 |');
    expect(result.summary).toContain('| Info | 0 |');
    expect(issueGate(result.output)).toBe(false);
  });

  it('counts critical-only findings from a normal exit 1 through the actual issue producer', () => {
    const result = audit({ stdout: report({ ...ZERO, critical: 2 }), exit: 1 });
    expect(result.output).toEqual({
      status: 'measured',
      vulns: '2',
      reason: 'none',
      exit_code: '1',
    });
    expect(result.summary).toContain('| Critical | 2 |');
    expect(issueGate(result.output)).toBe(true);
    const issue = issueBody(result.output);
    expect(issue).toContain('Audit status: measured');
    expect(issue).toContain('Vulnerabilities: 2');
    expect(issue).toContain('Audit exit code: 1');
    expect(issue).toContain('Address 2 open vulnerability/vulnerabilities');
    expect(issue).not.toContain('Restore security audit measurement');
  });

  it.each([
    ['empty output', '', 0, 'missing-output'],
    ['error JSON', JSON.stringify({ error: { message: MARKER } }), 1, 'invalid-counts'],
    [
      'error with plausible metadata',
      JSON.stringify({ error: { message: MARKER }, metadata: { vulnerabilities: ZERO } }),
      0,
      'invalid-counts',
    ],
    [
      'partial counts',
      JSON.stringify({ metadata: { vulnerabilities: { high: 0 } } }),
      0,
      'invalid-counts',
    ],
    ['malformed JSON', MARKER, 0, 'invalid-json'],
    ['process failure with plausible stdout', report(), 2, 'execution-failed'],
  ])('keeps %s unmeasured through the summary, gate and issue body', (_, stdout, exit, reason) => {
    const result = audit({ stdout, exit });
    expect(result.output).toEqual({
      status: 'unmeasured',
      vulns: 'UNMEASURED',
      reason,
      exit_code: String(exit),
    });
    expect(result.summary).toContain('UNMEASURED');
    expect(result.summary).not.toContain('| Total | 0 |');
    expect(issueGate(result.output)).toBe(true);
    const issue = issueBody(result.output);
    expect(issue).toContain('Audit status: unmeasured');
    expect(issue).toContain(`Audit reason: ${reason}`);
    expect(issue).toContain('Restore security audit measurement');
    expect(issue).not.toContain('Address UNMEASURED');
    expect(result.stdout + result.stderr + result.summary + issue).not.toContain(MARKER);
  });

  it('reports Node/tsx bootstrap failure as unmeasured rather than zero', () => {
    const result = audit({ stdout: report(), exit: 0, bootstrapFailure: true });
    expect(result.output).toEqual({
      status: 'unmeasured',
      vulns: 'UNMEASURED',
      reason: 'runner-failed',
      exit_code: 'UNMEASURED',
    });
    expect(result.summary).toContain('UNMEASURED');
    expect(issueGate(result.output)).toBe(true);
  });

  it('rejects captured output from a signalled process', () => {
    const result = audit({ stdout: report({ ...ZERO, critical: 2 }), exit: 1, signal: 'SIGTERM' });
    expect(result.output).toEqual({
      status: 'unmeasured',
      vulns: 'UNMEASURED',
      reason: 'execution-failed',
      exit_code: 'UNMEASURED',
    });
    expect(issueGate(result.output)).toBe(true);
  });

  it('bounds subprocess output without publishing captured diagnostics', () => {
    const result = audit({ stdout: MARKER + ' '.repeat(1024 * 1024), exit: 0 });
    expect(result.output.status).toBe('unmeasured');
    expect(result.output.vulns).toBe('UNMEASURED');
    expect(result.stdout + result.stderr + result.summary).not.toContain(MARKER);
  });

  it.each([
    '',
    '{',
    '{"status":"measured","vulns":"0"}',
    JSON.stringify({
      status: 'measured',
      vulns: '0',
      reason: 'none',
      exit_code: '0',
      summary: 'discarded',
    }) +
      '\n' +
      JSON.stringify({
        status: 'measured',
        vulns: '0',
        reason: 'none',
        exit_code: '0',
        summary: 'discarded',
      }),
  ])('keeps missing or invalid runner output unmeasured: %s', (bootstrapOutput) => {
    const result = audit({ stdout: report(), exit: 0, bootstrapOutput });
    expect(result.output).toEqual({
      status: 'unmeasured',
      vulns: 'UNMEASURED',
      reason: 'runner-failed',
      exit_code: 'UNMEASURED',
    });
    expect(result.summary).toContain('UNMEASURED');
  });

  it('sums all five severity counters on an exit 0 report', () => {
    const result = audit({
      stdout: report({ info: 1, low: 2, moderate: 3, high: 4, critical: 5 }),
      exit: 0,
    });
    expect(result.output).toEqual({
      status: 'measured',
      vulns: '15',
      reason: 'none',
      exit_code: '0',
    });
    expect(result.summary).toContain('| Info | 1 |');
    expect(result.summary).toContain('| Total | 15 |');
    expect(issueGate(result.output)).toBe(true);
  });

  it('treats missing audit status as unmeasured and preserves manual create_issue false', () => {
    const missing = { vulns: '0' };
    expect(issueGate(missing)).toBe(true);
    expect(issueGate(missing, 'workflow_dispatch', 'false')).toBe(false);
    expect(issueGate({ status: 'measured', vulns: '0' }, 'workflow_dispatch', 'true')).toBe(true);
  });

  it('wires each normalized security observation through job outputs', () => {
    const out = workflow.jobs['run-review']?.outputs;
    expect(out?.audit_status).toBe('${{ steps.security.outputs.status }}');
    expect(out?.audit_reason).toBe('${{ steps.security.outputs.reason }}');
    expect(out?.audit_exit_code).toBe('${{ steps.security.outputs.exit_code }}');
  });
});
