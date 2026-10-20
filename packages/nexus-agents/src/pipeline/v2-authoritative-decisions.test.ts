/** Production V2 instrumentation writes only its own pipeline-attempt authority. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { AuthoritativeDecisionStore } from './authoritative-decision-store.js';
import { delegateInputToTaskContract, executeDelegatePipeline } from './v2-delegate.js';
import { orchestrateInputToTaskContract, executeOrchestratePipeline } from './v2-orchestrate.js';

describe('actual V2 entrypoints persist bounded pipeline authority', () => {
  let runtimeDir: string;

  beforeEach(() => {
    runtimeDir = mkdtempSync(join(tmpdir(), 'nexus-v2-authority-'));
    vi.stubEnv('NEXUS_DATA_DIR', runtimeDir);
    vi.stubEnv('NEXUS_V2_POLICY_MODE', 'off');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(runtimeDir, { recursive: true, force: true });
  });

  it.each(['delegate', 'orchestrate'] as const)(
    'persists %s route instrumentation without certifying V1 delivery',
    async (kind) => {
      const task =
        kind === 'delegate'
          ? delegateInputToTaskContract({ task: 'Analyze the fixture task' })
          : orchestrateInputToTaskContract({ task: 'Analyze the fixture task' });
      const metrics =
        kind === 'delegate'
          ? await executeDelegatePipeline(task)
          : await executeOrchestratePipeline(task);
      expect(metrics.executed).toBe(true);
      const result = new AuthoritativeDecisionStore().getTaskSnapshot(task.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.currentState).toBe('terminal');
      expect(result.value?.committedTransitions).toHaveLength(2);
      expect(result.value?.committedTransitions.map((record) => record.reason)).toEqual([
        'v2-route-instrumentation',
        'v2-route-instrumentation',
      ]);
    }
  );
});
