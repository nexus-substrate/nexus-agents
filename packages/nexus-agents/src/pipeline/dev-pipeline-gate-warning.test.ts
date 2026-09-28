/**
 * The dev pipeline warns when its quality gate runs scripts in the directory
 * the implement expert edited in workspace-edit mode (#6792).
 *
 * Workspace-edit stops the expert from running commands, but the gate then
 * runs `<pm> run typecheck/lint/test` in the same directory, so a
 * `package.json` script or test file the expert edited is executed by the
 * pipeline. The result must say so, not only a debug log.
 *
 * @module pipeline/dev-pipeline-gate-warning.test
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { researchContextFromText } from './research-context.js';
import { runDevPipeline } from './dev-pipeline.js';
import type { DevPipelineStages, PipelineTask, QaReviewResult } from './dev-pipeline.js';
import type { TechniqueStatusSummary } from '../cli/research-types.js';

vi.mock('../context/context-retriever.js', () => ({
  getResearchInsightsForTask: (): Promise<readonly TechniqueStatusSummary[]> => Promise.resolve([]),
}));

const WORKSPACE = { accessMode: 'workspace-edit', directory: process.cwd() } as const;
const TRUSTED = {
  trustTier: '1',
  sourceTrustTier: '1',
  researchOverride: 'Operator plan',
} as const;

function stages(overrides?: Partial<DevPipelineStages>): DevPipelineStages {
  return {
    research: vi.fn().mockResolvedValue(researchContextFromText('Research findings')),
    plan: vi.fn().mockResolvedValue('Implementation plan: step 1'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
    decompose: vi.fn().mockResolvedValue([
      {
        id: 'task-1',
        title: 'Task 1',
        description: 'Implement step 1',
        assignedTo: 'coder',
        status: 'pending',
      },
    ] satisfies PipelineTask[]),
    implement: vi.fn().mockResolvedValue('Code implementation complete'),
    qaReview: vi.fn().mockResolvedValue({
      verdict: 'pass',
      feedback: 'Looks good',
      issues: [],
    } satisfies QaReviewResult),
    securityScan: vi
      .fn()
      .mockResolvedValue({ passed: true, verdict: 'pass', feedback: 'No findings' }),
    qualityGate: vi.fn().mockResolvedValue({ passed: true, feedback: 'All checks passed.' }),
    implementWorkspace: WORKSPACE,
    ...overrides,
  };
}

describe('quality gate over a workspace-edit implement directory (#6792)', () => {
  it.each(['advisory', 'blocking'] as const)(
    'warns on the result when the gate runs in %s mode',
    async (mode) => {
      const result = await runDevPipeline('Build feature X', stages(), {
        ...TRUSTED,
        qualityGate: mode,
      });

      expect(result.warnings).toHaveLength(1);
      const [warning] = result.warnings ?? [];
      expect(warning).toContain(WORKSPACE.directory);
      expect(warning).toContain('executed by the gate');
      expect(warning).toContain('#6794');
    }
  );

  it('warns on the blocking early return too (a red gate stops before the scan)', async () => {
    const result = await runDevPipeline(
      'Build feature X',
      stages({ qualityGate: vi.fn().mockResolvedValue({ passed: false, feedback: 'tsc' }) }),
      { ...TRUSTED, qualityGate: 'blocking' }
    );

    expect(result.completed).toBe(false);
    expect(result.warnings).toHaveLength(1);
  });

  it('does not warn when the gate is off (control)', async () => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      qualityGate: 'off',
    });

    expect(result.warnings).toBeUndefined();
    expect(s.qualityGate).not.toHaveBeenCalled();
  });

  it('does not warn when implement does not declare workspace-edit', async () => {
    const result = await runDevPipeline(
      'Build feature X',
      stages({ implementWorkspace: { accessMode: 'default', directory: '/x' } }),
      { ...TRUSTED, qualityGate: 'advisory' }
    );

    expect(result.warnings).toBeUndefined();
  });

  it('does not warn when no task reached implement', async () => {
    const s = stages({ decompose: vi.fn().mockResolvedValue([]) });
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      qualityGate: 'advisory',
    });

    expect(result.warnings).toBeUndefined();
    expect(s.implement).not.toHaveBeenCalled();
    expect(s.qualityGate).toHaveBeenCalledTimes(1);
  });
});

describe('quality gate refuses untrusted content in the real workspace (#6802)', () => {
  it.each([
    ['3', 'advisory'],
    ['3', 'blocking'],
    ['4', 'blocking'],
  ] as const)('refuses tier %s with a %s gate', async (tier, mode) => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      sourceTrustTier: tier,
      qualityGate: mode,
    });

    expect(s.implement).toHaveBeenCalledTimes(1);
    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(s.securityScan).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(result.securityRan).toBe(false);
    expect(result.warnings?.join(' ')).toMatch(/quality gate.*refused.*tier/i);
  });

  it('refuses an unmeasured caller even when the task declares tier 1', async () => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      researchOverride: 'Operator plan',
      sourceTrustTier: '1',
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(result.warnings?.join(' ')).toMatch(/quality gate.*refused.*unmeasured/i);
  });

  it('refuses tier 2 content in the real workspace', async () => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      sourceTrustTier: '2',
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(result.warnings?.join(' ')).toMatch(/quality gate.*refused.*tier 2/i);
  });

  it.each([undefined, { accessMode: 'default', directory: process.cwd() }] as const)(
    'refuses undeclared or non-enforcing workspace metadata: %j',
    async (implementWorkspace) => {
      const s = stages(implementWorkspace === undefined ? {} : { implementWorkspace });
      if (implementWorkspace === undefined) Reflect.deleteProperty(s, 'implementWorkspace');
      const result = await runDevPipeline('Build feature X', s, {
        ...TRUSTED,
        sourceTrustTier: '3',
        qualityGate: 'blocking',
      });

      expect(s.qualityGate).not.toHaveBeenCalled();
      expect(result.completed).toBe(false);
      expect(result.warnings?.join(' ')).toMatch(/quality gate.*refused/i);
    }
  );

  it('refuses a symlink alias of the real workspace', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'nexus-6802-alias-'));
    try {
      const alias = join(temp, 'repo');
      symlinkSync(process.cwd(), alias, 'dir');
      const s = stages({ implementWorkspace: { accessMode: 'workspace-edit', directory: alias } });
      const result = await runDevPipeline('Build feature X', s, {
        ...TRUSTED,
        sourceTrustTier: '3',
        qualityGate: 'blocking',
      });

      expect(s.qualityGate).not.toHaveBeenCalled();
      expect(result.completed).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('refuses a trailing-slash alias of the real workspace', async () => {
    const s = stages({
      implementWorkspace: { accessMode: 'workspace-edit', directory: `${process.cwd()}/.` },
    });
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      sourceTrustTier: '3',
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
  });

  it('refuses an unresolvable claimed workspace', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'nexus-6802-missing-'));
    rmSync(temp, { recursive: true });
    const s = stages({ implementWorkspace: { accessMode: 'workspace-edit', directory: temp } });
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      sourceTrustTier: '3',
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
  });

  it('refuses when external research lowers a declared tier 1 task', async () => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      trustTier: '1',
      sourceTrustTier: '1',
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(result.warnings?.join(' ')).toMatch(/quality gate.*refused.*tier 3/i);
  });

  it('allows the gate when implement used a separate scratch directory', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'nexus-6802-scratch-'));
    try {
      const s = stages({
        implementWorkspace: { accessMode: 'workspace-edit', directory: scratch },
      });
      const result = await runDevPipeline('Build feature X', s, {
        ...TRUSTED,
        sourceTrustTier: '3',
        qualityGate: 'blocking',
      });

      expect(s.qualityGate).toHaveBeenCalledTimes(1);
      expect(result.completed).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('runs the gate for a measured tier 1 task without lower-trust research', async () => {
    const s = stages();
    const result = await runDevPipeline('Build feature X', s, {
      ...TRUSTED,
      qualityGate: 'blocking',
    });

    expect(s.qualityGate).toHaveBeenCalledTimes(1);
    expect(result.completed).toBe(true);
  });
});
