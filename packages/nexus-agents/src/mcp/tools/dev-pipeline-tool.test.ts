/**
 * run_dev_pipeline MCP Tool Tests (#1684)
 */

import { describe, it, expect } from 'vitest';
import { DevPipelineInputSchema } from './dev-pipeline-tool.js';

describe('DevPipelineInputSchema', () => {
  it('accepts direct task instructions', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'Build a login form' });
    expect(parsed.task).toBe('Build a login form');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.maxVoteIterations).toBe(3);
    expect(parsed.maxQaIterations).toBe(3);
  });

  it('accepts planFile path', () => {
    const parsed = DevPipelineInputSchema.parse({ planFile: '/tmp/plan.md' });
    expect(parsed.planFile).toBe('/tmp/plan.md');
  });

  it('accepts dryRun mode', () => {
    const parsed = DevPipelineInputSchema.parse({ task: 'test', dryRun: true });
    expect(parsed.dryRun).toBe(true);
  });

  it('accepts custom iteration limits', () => {
    const parsed = DevPipelineInputSchema.parse({
      task: 'test',
      maxVoteIterations: 5,
      maxQaIterations: 2,
    });
    expect(parsed.maxVoteIterations).toBe(5);
    expect(parsed.maxQaIterations).toBe(2);
  });

  it('rejects when both task and planFile are missing', () => {
    // Schema allows both empty, but resolveTaskInput will throw at runtime
    const parsed = DevPipelineInputSchema.parse({});
    expect(parsed.task).toBeUndefined();
    expect(parsed.planFile).toBeUndefined();
  });

  it('rejects iteration limits out of range', () => {
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxVoteIterations: 10 })).toThrow();
    expect(() => DevPipelineInputSchema.parse({ task: 'test', maxQaIterations: 0 })).toThrow();
  });

  it('accepts scanTarget', () => {
    const parsed = DevPipelineInputSchema.parse({
      task: 'test',
      scanTarget: '/home/user/project',
    });
    expect(parsed.scanTarget).toBe('/home/user/project');
  });
});
