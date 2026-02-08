import { describe, it, expect, vi } from 'vitest';
import { createDelegateCommand } from './delegate.js';
import { createOrchestrateCommand } from './orchestrate.js';
import { createVoteCommand } from './vote.js';
import { createExpertCommand } from './expert.js';
import { createStatusCommand } from './status.js';
import { createWorkflowCommand } from './workflow.js';
import { createOutcomesCommand } from './outcomes.js';
import { createWatchCommand } from './watch.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const mockVotes = () =>
  Promise.resolve([
    { role: 'architect', vote: { decision: 'APPROVE', reasoning: 'Good' }, source: 'simulation' },
    { role: 'security', vote: { decision: 'APPROVE', reasoning: 'Safe' }, source: 'simulation' },
    { role: 'pm', vote: { decision: 'APPROVE', reasoning: 'Value' }, source: 'simulation' },
  ]);

vi.mock('nexus-agents', async (importOriginal) => {
  const orig: Record<string, unknown> = await importOriginal();

  return { ...orig, collectRealVotes: vi.fn().mockImplementation(mockVotes) };
});

describe('delegate command', () => {
  const cmd = createDelegateCommand();

  it('returns error for empty args', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Usage');
  });

  it('routes a task to a model', async () => {
    const result = await cmd.execute(['write', 'unit', 'tests']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Model:');
    expect(result.output).toContain('Reasoning:');
  });

  it('accepts --prefer flag', async () => {
    const result = await cmd.execute(['complex', 'analysis', '--prefer=reasoning']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Model:');
  });

  it('ignores invalid prefer values', async () => {
    const result = await cmd.execute(['task', '--prefer=invalid']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Model:');
  });
});

describe('orchestrate command', () => {
  const cmd = createOrchestrateCommand();

  it('returns error for empty args', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Usage');
  });

  it('shows routing info for a task', async () => {
    const result = await cmd.execute(['implement', 'auth', 'module']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task:');
    expect(result.output).toContain('Routed to:');
  });
});

describe('vote command', () => {
  const cmd = createVoteCommand();

  it('returns error for empty proposal', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBe(true);
  });

  it('shows vote parameters', async () => {
    const result = await cmd.execute(['Should', 'we', 'use', 'Ink?']);
    expect(result.output).toContain('Proposal:');
    expect(result.output).toContain('Strategy:');
  });

  it('accepts strategy flag', async () => {
    const result = await cmd.execute(['proposal', '--strategy=unanimous']);
    expect(result.output).toContain('unanimous');
  });

  it('accepts quick flag', async () => {
    const result = await cmd.execute(['proposal', '--quick']);
    expect(result.output).toContain('quick');
  });
});

describe('expert command', () => {
  const cmd = createExpertCommand();

  it('lists expert roles', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('code_expert');
    expect(result.output).toContain('security_expert');
  });

  it('handles list subcommand', async () => {
    const result = await cmd.execute(['list']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('architecture_expert');
  });

  it('returns error for unknown subcommand', async () => {
    const result = await cmd.execute(['unknown']);
    expect(result.isError).toBe(true);
  });
});

describe('status command', () => {
  const cmd = createStatusCommand();

  it('shows task outcomes (may be empty)', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task Outcomes');
  });
});

describe('workflow command', () => {
  const cmd = createWorkflowCommand();

  it('returns error for no subcommand', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Usage');
  });

  it('lists available workflows', async () => {
    const result = await cmd.execute(['list']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('echo');
  });

  it('returns error for unknown workflow', async () => {
    const result = await cmd.execute(['run', 'nonexistent']);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Unknown workflow');
  });

  it('returns error for run without name', async () => {
    const result = await cmd.execute(['run']);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Usage');
  });
});

describe('outcomes command', () => {
  const cmd = createOutcomesCommand();

  it('has correct name and description', () => {
    expect(cmd.name).toBe('outcomes');
    expect(cmd.description).toContain('outcome');
  });

  it('returns outcomes data (may be empty)', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task Outcomes');
  });

  it('accepts --cli filter flag', async () => {
    const result = await cmd.execute(['--cli=claude']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task Outcomes');
  });

  it('accepts --category filter flag', async () => {
    const result = await cmd.execute(['--category=code_generation']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task Outcomes');
  });

  it('accepts --limit flag', async () => {
    const result = await cmd.execute(['--limit=5']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Task Outcomes');
  });
});

describe('watch command', () => {
  const cmd = createWatchCommand();

  it('has correct name and description', () => {
    expect(cmd.name).toBe('watch');
    expect(cmd.description).toContain('weather');
  });

  it('returns error for no target', async () => {
    const result = await cmd.execute([]);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('Usage');
  });

  it('returns error for invalid target', async () => {
    const result = await cmd.execute(['invalid']);
    expect(result.isError).toBe(true);
    expect(result.output).toContain('weather');
    expect(result.output).toContain('outcomes');
  });

  it('shows weather snapshot', async () => {
    const result = await cmd.execute(['weather']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Weather Snapshot');
  });

  it('shows outcomes snapshot', async () => {
    const result = await cmd.execute(['outcomes']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('Outcomes Snapshot');
  });

  it('accepts --refresh flag', async () => {
    const result = await cmd.execute(['weather', '--refresh=10']);
    expect(result.isError).toBeUndefined();
    expect(result.output).toContain('10s');
  });
});
