/**
 * Every builder of `BanditContext.timePressure` must use the same constant
 * until something computes one (#4875).
 *
 * Nothing in the tree produces a time-pressure measurement, so the feature is
 * a constant and its LinUCB coefficient is meaningless. That is documented and
 * accepted. What is NOT acceptable is different constants on different paths:
 * `composite-router-helpers` used 0.3 while `LinUCBStage` and the
 * `warmStart`/`seedPriors` replay used 0.5. A constant carries no information;
 * two constants let the bandit use the value as a PATH INDICATOR, which is
 * accidental signal fitted against a dimension nobody measures.
 *
 * This test is why the constant cannot drift apart again. When a real producer
 * lands, it replaces the constant everywhere and this test should be rewritten
 * to assert the producer is wired, not deleted.
 *
 * @module cli-adapters/time-pressure-agreement.test
 * (Source: Issue #4875)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { taskAnalysisResultToBanditContext } from '../core/task-analysis/task-profile-adapter.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';

/** The value every replay path uses, and therefore the only honest default. */
const NEUTRAL = 0.5;

const analysis = {
  complexityScore: 0.5,
  estimatedTokens: 1000,
  capabilities: { codeGeneration: true },
  reasoningType: 'reasoning',
} as unknown as TaskAnalysisResult;

describe('timePressure constant agreement (#4875)', () => {
  it('the task-analysis builder defaults to the neutral value', () => {
    expect(taskAnalysisResultToBanditContext(analysis).timePressure).toBe(NEUTRAL);
  });

  it('still honours an explicitly supplied value', () => {
    // The pair: the default changing must not mean the option is ignored. No
    // caller supplies it today, which is exactly why the default matters.
    expect(taskAnalysisResultToBanditContext(analysis, { timePressure: 0.9 }).timePressure).toBe(
      0.9
    );
  });

  it('no production builder still hardcodes the old 0.3', () => {
    // Source-level because the builders live in separate modules with
    // different inputs; a value-level test would need each one's context
    // fixture and would miss a sixth site added later.
    const roots = [
      'cli-adapters/composite-router-helpers.ts',
      'cli-adapters/routing/stages/linucb-stage.ts',
      'core/task-analysis/task-profile-adapter.ts',
      'cli-adapters/linucb-bandit.ts',
    ];
    const offenders: string[] = [];
    for (const rel of roots) {
      const src = readFileSync(join(__dirname, '..', rel), 'utf-8');
      for (const line of src.split('\n')) {
        // Skip comments — they discuss the old value deliberately.
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (/timePressure:\s*0\.3\b/.test(line)) offenders.push(`${rel}: ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
