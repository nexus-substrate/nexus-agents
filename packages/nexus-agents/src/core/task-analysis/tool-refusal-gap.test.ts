/**
 * Tests for tool-refusal capability gaps (#4651).
 *
 * @module core/task-analysis/tool-refusal-gap.test
 */

import { describe, expect, it } from 'vitest';

import { createCapabilityGapLedger } from './capability-gap-ledger.js';
import { recordToolRefusal, toolRefusalGapName } from './tool-refusal-gap.js';

describe('toolRefusalGapName', () => {
  it('is a stable, deduplicable key of tool plus capability', () => {
    expect(toolRefusalGapName('extract_symbols', '.py')).toBe('extract_symbols:.py');
  });

  it('normalises case so .PY and .py are one gap, not two', () => {
    // The dedup key IS the frequency count. Two spellings of one capability
    // would each sit below the trigger threshold while their sum was above it.
    expect(toolRefusalGapName('extract_symbols', '.PY')).toBe('extract_symbols:.py');
  });
});

describe('recordToolRefusal', () => {
  it('records a gap the ledger can rank', () => {
    const ledger = createCapabilityGapLedger();
    recordToolRefusal(
      { tool: 'extract_symbols', capability: '.py', suggestion: 'add a Python parser' },
      { goal: 'read the handler' },
      ledger
    );

    const [summary] = ledger.summarize();
    expect(summary?.type).toBe('tool_refusal');
    expect(summary?.name).toBe('extract_symbols:.py');
    expect(summary?.count).toBe(1);
  });

  it('accumulates repeats of the same refusal', () => {
    const ledger = createCapabilityGapLedger();
    for (let i = 0; i < 4; i += 1) {
      recordToolRefusal(
        { tool: 'extract_symbols', capability: '.py', suggestion: 's' },
        {},
        ledger
      );
    }
    expect(ledger.summarize()[0]?.count).toBe(4);
  });

  it('keeps distinct capabilities distinct', () => {
    const ledger = createCapabilityGapLedger();
    recordToolRefusal({ tool: 'extract_symbols', capability: '.py', suggestion: 's' }, {}, ledger);
    recordToolRefusal({ tool: 'extract_symbols', capability: '.go', suggestion: 's' }, {}, ledger);
    expect(ledger.summarize()).toHaveLength(2);
  });

  it('records nothing when the capability is empty', () => {
    // A refusal with no nameable capability is unmeasured, not a gap. Recording
    // it under an empty key would inflate a bucket that means nothing.
    const ledger = createCapabilityGapLedger();
    recordToolRefusal({ tool: 'extract_symbols', capability: '', suggestion: 's' }, {}, ledger);
    expect(ledger.size()).toBe(0);
  });

  it('carries the goal through as an example', () => {
    const ledger = createCapabilityGapLedger();
    recordToolRefusal(
      { tool: 'extract_symbols', capability: '.rs', suggestion: 's' },
      { goal: 'audit the parser' },
      ledger
    );
    expect(ledger.summarize()[0]?.exampleGoals).toContain('audit the parser');
  });
});
