/** Static regression guard for release-path npm environment cleanup (#6908). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

import { ROOT } from './script-paths.js';

const WRAPPER = 'pnpm exec tsx scripts/publish-env.ts ';
const DECISION = 'bash scripts/decide-publish-smoke.sh "$GITHUB_SHA"';
const WORKFLOW = join(ROOT, '.github/workflows/release.yml');
const WorkflowSchema = z.object({
  jobs: z.record(
    z.string(),
    z.object({
      steps: z.array(
        z.object({
          id: z.string().optional(),
          name: z.string().optional(),
          run: z.string().optional(),
        })
      ),
    })
  ),
});

// Keyed by job/step id. This script's npm view runs directly in the Actions
// shell, never as a child of pnpm. Keep the exact bare Bash invocation: the
// workflow-output-wiring guard only recognizes that form as an output producer.
const SHELL_EXEMPTIONS: Readonly<Record<string, { command: string; reason: string }>> = {
  'publish-smoke/publish-path': {
    command: DECISION,
    reason: 'Direct Actions shell npm lookup; bare Bash preserves output-producer detection.',
  },
};

/** Split shell commands without treating quoted prose or arguments as commands. */
function shellCommands(run: string): string[] {
  const commands: string[] = [];
  // Substitutions execute commands even inside double quotes. Scan their bodies
  // separately, then replace them so they cannot donate a wrapper to the caller.
  const text = run
    .replace(/\\\n/g, ' ')
    .replace(/#[^\n]*|'[^']*'|\$\(([^()]*)\)/g, (match: string, body: string | undefined) => {
      if (body === undefined) return match;
      commands.push(...shellCommands(body));
      return 'SUBSTITUTION';
    });
  const tokens = text.match(/#[^\n]*|'[^']*'|"(?:\\.|[^"\\])*"|\n|[;&|()]|[^\s;&|()]+/g) ?? [];
  let command: string[] = [];
  for (const token of tokens) {
    if (token.startsWith('#')) continue;
    if (/^[\n;&|()]$/.test(token)) {
      if (command.length > 0) commands.push(command.join(' '));
      command = [];
    } else {
      command.push(token);
    }
  }
  if (command.length > 0) commands.push(command.join(' '));
  return commands.map((value) => value.replace(/^(?:(?:if|then|elif|do|!)\s+)+/, ''));
}

function invokesNpm(command: string): boolean {
  const invocation = command.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)+/, '');
  if (/^(?:pnpm exec\s+)?(?:npm|npx)(?:\s|$)/.test(invocation)) return true;
  if (isPnpmPublishOrRelease(invocation)) return true;
  return /^(?:pnpm exec\s+)?(?:(?:tsx|node)\s+)?scripts\/release-publish\.ts(?:\s|$)/.test(
    invocation
  );
}

/** Options that take a value, so the token after them is not the subcommand. */
const PNPM_VALUE_OPTIONS = new Set(['--filter', '-F', '--dir', '-C']);

/**
 * True for `pnpm [options] publish|release`. A token walk, not a regex: the
 * equivalent nested-quantifier regex backtracks exponentially (CodeQL js/redos).
 */
function isPnpmPublishOrRelease(invocation: string): boolean {
  const tokens = invocation.split(/\s+/).filter((token) => token.length > 0);
  if (tokens[0] !== 'pnpm') return false;
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (PNPM_VALUE_OPTIONS.has(token)) {
      index++;
      continue;
    }
    if (token.startsWith('-')) continue;
    return token === 'publish' || token === 'release';
  }
  return false;
}

interface Inspection {
  npmCommands: number;
  exemptSteps: string[];
  unwrapped: string[];
}

function inspectCommands(
  run: string,
  label: string
): Pick<Inspection, 'npmCommands' | 'unwrapped'> {
  let npmCommands = 0;
  const unwrapped: string[] = [];
  for (const command of shellCommands(run)) {
    const wrapped = command.startsWith(WRAPPER);
    if (!invokesNpm(wrapped ? command.slice(WRAPPER.length) : command)) continue;
    npmCommands++;
    if (!wrapped) unwrapped.push(`${label}: ${command}`);
  }
  return { npmCommands, unwrapped };
}

function inspectStep(
  jobId: string,
  step: z.infer<typeof WorkflowSchema>['jobs'][string]['steps'][number]
): Inspection {
  if (step.run === undefined) return { npmCommands: 0, unwrapped: [], exemptSteps: [] };
  const label = `${jobId}: ${step.name ?? step.id ?? '(unnamed step)'}`;
  const result = { ...inspectCommands(step.run, label), exemptSteps: [] as string[] };
  const exemption = SHELL_EXEMPTIONS[`${jobId}/${step.id ?? step.name ?? ''}`];
  if (exemption !== undefined) {
    // An allowlisted step cannot grow arbitrary commands or move under pnpm.
    if (step.run.trim() !== exemption.command)
      result.unwrapped.push(`${label}: changed shell exemption (${exemption.reason})`);
    else result.exemptSteps.push(label);
  }
  return result;
}

function inspectWorkflow(source: string): Inspection {
  const workflow = WorkflowSchema.parse(parse(source) as unknown);
  let npmCommands = 0;
  const exemptSteps: string[] = [];
  const unwrapped: string[] = [];
  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
      const result = inspectStep(jobId, step);
      npmCommands += result.npmCommands;
      exemptSteps.push(...result.exemptSteps);
      unwrapped.push(...result.unwrapped);
    }
  }
  // Exempt indirect shell lookups do not satisfy this: losing all direct npm
  // invocations means the parser/check is unmeasured, never a successful guard.
  if (npmCommands === 0)
    throw new Error(
      'release.yml: zero npm-invoking commands found; wrapper coverage is unmeasured'
    );
  return { npmCommands, exemptSteps, unwrapped };
}

function fixture(run: string, id = 'probe', job = 'release'): string {
  return `jobs:\n  ${job}:\n    steps:\n      - name: Probe\n        id: ${id}\n        run: |\n${run
    .split('\n')
    .map((line) => `          ${line}`)
    .join('\n')}\n`;
}

describe('release npm commands use publish-env (#6908)', () => {
  it('wraps every npm/npx and pnpm publish/release run command, except the explicit shell allowlist', () => {
    const result = inspectWorkflow(readFileSync(WORKFLOW, 'utf8'));
    expect(result.unwrapped, `${String(result.npmCommands)} npm-invoking commands checked`).toEqual(
      []
    );
    expect(result.exemptSteps).toEqual(['publish-smoke: Decide whether this run publishes']);
  });

  it.each([
    'npm view nexus-agents version',
    'npm install ./package.tgz',
    'npx -y @cyclonedx/cdxgen',
    'pnpm publish --access public',
    'pnpm --config.node-linker=hoisted -r publish --dry-run',
    'pnpm release',
    'pnpm exec tsx scripts/release-publish.ts',
  ])('reports the step name for unwrapped %s', (command) => {
    expect(inspectWorkflow(fixture(command)).unwrapped).toEqual([`release: Probe: ${command}`]);
    expect(inspectWorkflow(fixture(`${WRAPPER}${command}`)).unwrapped).toEqual([]);
  });

  it('checks substitutions, continuations and each command in a multi-command step', () => {
    const run = `${WRAPPER}npm install ./package.tgz; npm view nexus-memory version\nversion=$(${WRAPPER}npm view nexus-agents version)\n${WRAPPER}npx -y cdxgen \\\n  -t npm`;
    const result = inspectWorkflow(fixture(run));
    expect(result.npmCommands).toBe(4);
    expect(result.unwrapped).toEqual(['release: Probe: npm view nexus-memory version']);
  });

  it('does not count commented commands, quoted prose or npm as an npx argument', () => {
    const run = `# npm view fake version\n# $(npm view fake version)\necho '$(npm view fake version)'\necho "npm view; pnpm release"\n${WRAPPER}npx -y cdxgen -t npm`;
    expect(inspectWorkflow(fixture(run)).npmCommands).toBe(1);
  });

  it.each([
    'NPM_CONFIG_REGISTRY=https://registry.npmjs.org npm view nexus-agents version',
    'pnpm exec npm view nexus-agents version',
    'pnpm --filter nexus-agents publish',
  ])('detects npm invoked with a command prefix: %s', (command) => {
    expect(inspectWorkflow(fixture(command)).unwrapped).toEqual([`release: Probe: ${command}`]);
  });

  it('detects a command substitution inside double quotes', () => {
    const result = inspectWorkflow(fixture('echo "version=$(npm view nexus-agents version)"'));
    expect(result.unwrapped).toEqual(['release: Probe: npm view nexus-agents version']);
  });

  it('keeps the next command after a substitution with quoted arguments', () => {
    const run = `echo "Packed: $(basename "$TARBALL")"\n${WRAPPER}npm install --prefix "$SCRATCH/tree" "$TARBALL"`;
    expect(inspectWorkflow(fixture(run)).npmCommands).toBe(1);
  });

  it('fails explicitly when there are zero npm-invoking commands', () => {
    expect(() => inspectWorkflow(fixture('pnpm build'))).toThrow('zero npm-invoking commands');
    expect(() => inspectWorkflow('jobs: {}')).toThrow('zero npm-invoking commands');
    expect(() => inspectWorkflow(fixture(DECISION, 'publish-path', 'publish-smoke'))).toThrow(
      'zero npm-invoking commands'
    );
  });

  it('only exempts the exact bare shell command in the allowlisted step', () => {
    const source = fixture(
      `${DECISION}\n${WRAPPER}npm view nexus-agents version`,
      'publish-path',
      'publish-smoke'
    );
    expect(inspectWorkflow(source).unwrapped).toEqual([
      expect.stringContaining('publish-smoke: Probe: changed shell exemption'),
    ]);
  });
});
