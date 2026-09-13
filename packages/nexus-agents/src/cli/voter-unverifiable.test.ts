/**
 * A seat that could not read the artifact is `unverifiable`, not `abstain`
 * (#6094, design panel on #6068: option C, 6 of 6).
 *
 * The six reasoning fixtures below are the leading sentences of REAL ledger
 * entries from `.nexus-agents/governance/vote-records.jsonl` (records 269,
 * 270, 272, 273 x2, 277), copied verbatim. They are the regression set for the
 * reasoning-text fallback; every one was recorded as an ordinary `abstain`
 * with `source: 'llm'` — and one (record 277, the `vote-1789058788915-6lfrbuq`
 * class) voted APPROVE on the proposal text after failing to read.
 */
import { describe, it, expect } from 'vitest';

import {
  UNVERIFIABLE_REASONING_RE,
  UNVERIFIABLE_STDERR_RE,
  classifyUnverifiable,
  isAbsentSeat,
  markUnverifiable,
} from './voter-unverifiable.js';
import type { AgentVoteResult } from './vote-types.js';

const LEDGER_FIXTURES: readonly string[] = [
  // 269 scope_steward
  "I cannot ratify the specified artifact: the checkout reports HEAD e04c6d210a, not cd5896888e. Subsequent source reads failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'; no alternative repository resource was available.",
  // 270 devex
  "I could not verify HEAD 7fe7f84df0 or inspect the implementation: repository reads failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', and resource discovery provided no repository access.",
  // 272 scope_steward
  "The described scope is justified, but I cannot ratify HEAD 461ee61468 against the tree. Shell reads failed before execution with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'; the browser fallback was already in use; the symbol reader returned ENOENT for both candidate ledger-append.ts paths.",
  // 273 devex
  "However, I could not verify commit 461ee61468: shell execution failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'; browser access failed because its profile was in use; source-tool reads returned ENOENT at both attempted paths.",
  // 273 scope_steward
  "The proposed scope is justified, but I cannot ratify commit 461ee61468 without inspecting it. Shell access failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'; the alternate symbol reader returned ENOENT for both candidate source paths.",
  // 277 scope_steward — voted APPROVE
  "This is a proposal assessment, not an independently verified diff review. My attempted repository inspection failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', so I could not confirm caller coverage or reproduce the reported gates.",
];

/** Phrases a seat that DID read the artifact plausibly writes. Must not match. */
const GENUINE_REASONING: readonly string[] = [
  'I abstain: this proposal is outside my expertise and I have no basis to judge the data model.',
  'The diff at packages/nexus-agents/src/audit/vote-record.ts:200 adds the field; tests cover the empty case. Approve.',
  'Reject — the sandbox flag is Linux-only but the docs claim it works everywhere.',
  'The reader could not read the summary comment easily, but the code itself is clear; the artifact was inspected in full.',
  '',
];

function llm(overrides: Partial<AgentVoteResult> = {}): AgentVoteResult {
  return {
    role: 'scope_steward',
    vote: { decision: 'approve', confidence: 0.85, reasoning: LEDGER_FIXTURES[5] as string },
    processingTimeMs: 1200,
    source: 'llm',
    cli: 'cli-codex',
    model: 'codex-5.3',
    selectedOption: 'C',
    inputTokens: 100,
    ...overrides,
  };
}

describe('UNVERIFIABLE_REASONING_RE — the fallback (#6094)', () => {
  it.each(LEDGER_FIXTURES.map((r, i) => [i, r] as const))(
    'matches ledger fixture %i',
    (_i, reasoning) => {
      expect(UNVERIFIABLE_REASONING_RE.test(reasoning)).toBe(true);
    }
  );

  it.each(GENUINE_REASONING.map((r) => [r.slice(0, 40), r] as const))(
    'does not match a seat that read the artifact: %s',
    (_label, reasoning) => {
      expect(UNVERIFIABLE_REASONING_RE.test(reasoning)).toBe(false);
    }
  );

  it('matches the phrase the voter prompt asks a blind seat to write', () => {
    expect(UNVERIFIABLE_REASONING_RE.test('UNVERIFIABLE: could not read the artifact.')).toBe(true);
  });
});

describe('classifyUnverifiable', () => {
  it('names the structured signal first: stderr wins even when reasoning is clean', () => {
    expect(
      classifyUnverifiable({
        cliStderr: 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n',
        reasoning: 'Approve. The diff is small and the tests cover the empty case.',
      })
    ).toBe('stderr');
  });

  it('falls back to the reasoning text when there is no stderr', () => {
    expect(classifyUnverifiable({ reasoning: LEDGER_FIXTURES[0] as string })).toBe('reasoning');
    expect(classifyUnverifiable({ cliStderr: '', reasoning: LEDGER_FIXTURES[1] as string })).toBe(
      'reasoning'
    );
  });

  it('ordinary stderr chatter is not a signal', () => {
    expect(
      classifyUnverifiable({
        cliStderr: 'warning: model deprecated, use the newer alias\n',
        reasoning: 'Approve; reviewed the diff.',
      })
    ).toBeUndefined();
    expect(UNVERIFIABLE_STDERR_RE.test('warning: model deprecated')).toBe(false);
  });

  it('the empty case, named: no stderr and clean reasoning is NOT unverifiable', () => {
    expect(classifyUnverifiable({ reasoning: '' })).toBeUndefined();
    expect(classifyUnverifiable({ cliStderr: undefined, reasoning: 'I abstain.' })).toBeUndefined();
  });
});

describe('markUnverifiable', () => {
  it('records the seat as unverifiable and discards the decision it returned', () => {
    const marked = markUnverifiable(llm(), 'reasoning');
    expect(marked.source).toBe('unverifiable');
    expect(marked.unverifiableSignal).toBe('reasoning');
    // Never approve/reject: the legacy decision field says abstain.
    expect(marked.vote.decision).toBe('abstain');
    // No confidence in a verdict that was not cast.
    expect(marked.vote.confidence).toBe(0);
  });

  it('never credits an option: a blind seat cannot have chosen one', () => {
    expect(markUnverifiable(llm(), 'stderr').selectedOption).toBeUndefined();
  });

  it('keeps the provenance that IS real — reasoning, model, cli, tokens', () => {
    const marked = markUnverifiable(llm(), 'stderr');
    expect(marked.vote.reasoning).toBe(LEDGER_FIXTURES[5]);
    expect(marked.model).toBe('codex-5.3');
    expect(marked.cli).toBe('cli-codex');
    expect(marked.inputTokens).toBe(100);
    expect(marked.role).toBe('scope_steward');
  });
});

describe('isAbsentSeat', () => {
  it('an errored seat and an unverifiable seat are both absences', () => {
    expect(isAbsentSeat({ source: 'error' })).toBe(true);
    expect(isAbsentSeat({ source: 'unverifiable' })).toBe(true);
  });
  it('a seat that answered is present, whether live or simulated', () => {
    expect(isAbsentSeat({ source: 'llm' })).toBe(false);
    expect(isAbsentSeat({ source: 'simulation' })).toBe(false);
  });
});
