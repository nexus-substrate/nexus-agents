/**
 * Tests for the ATBench skeleton (#1981).
 *
 * Covers the adapter contract: load (fixture path), run (stub scorer),
 * evaluate (confusion), isPass, summarize (precision/recall/F1).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ATBenchAdapter, classifyConfusion, scoreTrajectoryStub } from './index.js';
import type { ATBenchTrajectory } from './types.js';

function makeTrajectory(overrides: Partial<ATBenchTrajectory> = {}): ATBenchTrajectory {
  return {
    id: 'test-001',
    scenario: 'skill-injection',
    userRequest: 'run the helper tool',
    sessionTranscript: ['user: run the helper tool'],
    toolEvents: [{ tool: 'helper_tool' }],
    safetyLabel: 'safe',
    taxonomy: {
      riskSource: 'user_instruction',
      failureMode: 'safe_control_flow',
      harm: 'none',
    },
    ...overrides,
  };
}

describe('classifyConfusion', () => {
  it('returns tp when both unsafe', () => {
    expect(classifyConfusion('unsafe', 'unsafe')).toBe('tp');
  });
  it('returns tn when both safe', () => {
    expect(classifyConfusion('safe', 'safe')).toBe('tn');
  });
  it('returns fp when predicted unsafe but actually safe', () => {
    expect(classifyConfusion('unsafe', 'safe')).toBe('fp');
  });
  it('returns fn when predicted safe but actually unsafe', () => {
    expect(classifyConfusion('safe', 'unsafe')).toBe('fn');
  });
});

describe('scoreTrajectoryStub', () => {
  it('echoes the ground-truth label (perfect oracle in skeleton)', () => {
    const t = makeTrajectory({ safetyLabel: 'unsafe' });
    const pred = scoreTrajectoryStub(t);
    expect(pred.predictedLabel).toBe('unsafe');
    expect(pred.trajectoryId).toBe(t.id);
    expect(pred.reasoning).toMatch(/stub-scorer/);
  });
});

describe('ATBenchAdapter', () => {
  it('has name and default variant', () => {
    const a = new ATBenchAdapter();
    expect(a.name).toBe('atbench');
    expect(a.variant).toBe('claw');
  });

  it('accepts codex variant', () => {
    const a = new ATBenchAdapter('codex');
    expect(a.variant).toBe('codex');
  });

  it('loadInstances reads a JSONL fixture', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atbench-test-'));
    const fixturePath = join(dir, 'fixture.jsonl');
    try {
      const t1 = makeTrajectory({ id: 't1' });
      const t2 = makeTrajectory({ id: 't2', safetyLabel: 'unsafe' });
      writeFileSync(fixturePath, `${JSON.stringify(t1)}\n${JSON.stringify(t2)}\n`);
      const adapter = new ATBenchAdapter();
      const instances = await adapter.loadInstances({ variant: 'claw', fixturePath });
      expect(instances).toHaveLength(2);
      expect(instances[0]?.id).toBe('t1');
      expect(instances[1]?.safetyLabel).toBe('unsafe');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadInstances respects maxInstances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atbench-test-'));
    const fixturePath = join(dir, 'fixture.jsonl');
    try {
      const lines = [
        makeTrajectory({ id: 'a' }),
        makeTrajectory({ id: 'b' }),
        makeTrajectory({ id: 'c' }),
      ]
        .map((t) => JSON.stringify(t))
        .join('\n');
      writeFileSync(fixturePath, lines);
      const adapter = new ATBenchAdapter();
      const instances = await adapter.loadInstances({
        variant: 'claw',
        fixturePath,
        maxInstances: 2,
      });
      expect(instances).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loadInstances throws a clear error when fixturePath is missing', async () => {
    const adapter = new ATBenchAdapter();
    await expect(adapter.loadInstances({ variant: 'claw' })).rejects.toThrow(/fixturePath/);
  });

  it('runInstance returns a stub prediction', async () => {
    const adapter = new ATBenchAdapter();
    const t = makeTrajectory({ safetyLabel: 'unsafe' });
    const pred = await adapter.runInstance(t, { timeoutMs: 1000 });
    expect(pred.trajectoryId).toBe(t.id);
    expect(pred.predictedLabel).toBe('unsafe');
  });

  it('evaluate computes confusion correctly', async () => {
    const adapter = new ATBenchAdapter();
    const t = makeTrajectory({ safetyLabel: 'unsafe' });
    const result = await adapter.evaluate(t, {
      trajectoryId: t.id,
      predictedLabel: 'safe',
      reasoning: 'mock',
    });
    expect(result.confusion).toBe('fn');
  });

  it('isPass is true for tp and tn', () => {
    const adapter = new ATBenchAdapter();
    expect(adapter.isPass({ confusion: 'tp' } as never)).toBe(true);
    expect(adapter.isPass({ confusion: 'tn' } as never)).toBe(true);
    expect(adapter.isPass({ confusion: 'fp' } as never)).toBe(false);
    expect(adapter.isPass({ confusion: 'fn' } as never)).toBe(false);
  });

  it('summarize computes precision/recall/F1', () => {
    const adapter = new ATBenchAdapter();
    // 2 tp, 1 fp, 1 fn, 6 tn → precision 2/3, recall 2/3, f1 2/3
    const results = [
      { confusion: 'tp' },
      { confusion: 'tp' },
      { confusion: 'fp' },
      { confusion: 'fn' },
      { confusion: 'tn' },
      { confusion: 'tn' },
      { confusion: 'tn' },
      { confusion: 'tn' },
      { confusion: 'tn' },
      { confusion: 'tn' },
    ] as readonly unknown[] as readonly import('./types.js').ATBenchEvalResult[];

    const s = adapter.summarize(results, 1234);
    expect(s.name).toBe('atbench');
    expect(s.total).toBe(10);
    expect(s.passed).toBe(8); // 2 tp + 6 tn
    expect(s.passRate).toBeCloseTo(0.8, 2);
    expect(s.runTimeMs).toBe(1234);
    const meta = s.metadata as {
      precision: number;
      recall: number;
      f1: number;
      positiveClass: string;
    };
    expect(meta.precision).toBeCloseTo(2 / 3, 3);
    expect(meta.recall).toBeCloseTo(2 / 3, 3);
    expect(meta.f1).toBeCloseTo(2 / 3, 3);
    expect(meta.positiveClass).toBe('unsafe');
  });

  it('summarize returns zero rates for empty results', () => {
    const adapter = new ATBenchAdapter();
    const s = adapter.summarize([], 0);
    expect(s.total).toBe(0);
    expect(s.passed).toBe(0);
    expect(s.passRate).toBe(0);
  });
});
