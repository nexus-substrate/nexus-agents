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

/**
 * Seats that quote the error but report they RECOVERED (#6104). The #6101
 * adversarial review executed the first two; each lost its vote. Must NOT
 * classify as unverifiable: the error string is present, but the reasoning
 * asserts a successful read — a recovery phrase, or a `path/file.ext:LINE`
 * citation.
 */
const RECOVERED_REASONING: readonly string[] = [
  "first shell attempt printed 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted', but the retry succeeded and I read all three files",
  'repository reads failed with a transient EAGAIN; the second attempt succeeded',
  "shell execution failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted' on the first call; the guard at src/x.ts:12 is what the diff changes, and it names the empty case. Approve.",
];

/** Quotes the error and cites nothing — no recovery asserted, so the fallback fires. */
const ERROR_WITHOUT_RECOVERY =
  "shell execution failed with 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'; I am judging the proposal text.";

/** Begins with the prefix the prompt asks for; matches no error string, and even cites a line. */
const PREFIX_ONLY = 'UNVERIFIABLE: the sandbox refused every read of src/x.ts:12.';

/**
 * The two response-parse errors the catfish seat logged on the #6241 panel
 * (#6244), plus the form an errored seat's placeholder reasoning carries.
 * A parse failure says the model returned non-JSON, not that the seat could
 * not read the repository: it stays an errored seat, never unverifiable.
 */
const PARSE_FAILURE_ERRORS: readonly string[] = [
  'Vote parsing failed: Vote response parsing failed: Unexpected end of JSON input',
  `Vote parsing failed: Vote response parsing failed: Unexpected token 'I', "I cannot ac"... is not valid JSON`,
  '[Error] Vote execution failed: Vote parsing failed: Vote response parsing failed: Unexpected end of JSON input',
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

  it.each(PARSE_FAILURE_ERRORS.map((r) => [r.slice(0, 60), r] as const))(
    'a response-parse failure is not a failed read (#6244): %s',
    (_label, error) => {
      expect(UNVERIFIABLE_REASONING_RE.test(error)).toBe(false);
    }
  );
});

describe('the recovery guard (#6104)', () => {
  /** The verdict for a reasoning with no stderr — the guards are module-private, so this is the probe. */
  const classify = (reasoning: string): string | undefined => classifyUnverifiable({ reasoning });

  it('the prefix rule is anchored at the start of the reasoning', () => {
    expect(classify(PREFIX_ONLY)).toBe('reasoning');
    expect(classify('  UNVERIFIABLE: could not read the artifact')).toBe('reasoning');
    expect(classify('Approve. Not UNVERIFIABLE: I read it.')).toBeUndefined();
  });

  it('a citation is path/file.ext:LINE and nothing looser', () => {
    const quoted = "shell execution failed with 'bwrap: loopback: Failed RTM_NEWADDR'; ";
    expect(classify(`${quoted}the guard at src/x.ts:12 names the empty case`)).toBeUndefined();
    expect(
      classify(`${quoted}see packages/nexus-agents/src/audit/vote-record.ts:200`)
    ).toBeUndefined();
    // A bare time, a version, a ratio, a SHA: none is a citation, so the seat is still blind.
    expect(classify(`${quoted}at 12:30 the run took 3:1 on v2.9`)).toBe('reasoning');
    expect(classify(`${quoted}HEAD 461ee61468 against the tree`)).toBe('reasoning');
  });

  it('the recovery phrases are each recognised, and none appears in the ledger set', () => {
    const quoted = "repository reads failed with 'bwrap: loopback: Failed RTM_NEWADDR'; ";
    expect(classify(`${quoted}but the retry succeeded and I read all three files`)).toBeUndefined();
    expect(classify(`${quoted}the second attempt succeeded`)).toBeUndefined();
    expect(classify(`${quoted}then read the file through the tool`)).toBeUndefined();
    expect(classify(`${quoted}I was able to read the diff after a retry`)).toBeUndefined();
    for (const fixture of LEDGER_FIXTURES) expect(classify(fixture)).toBe('reasoning');
  });

  it.each(RECOVERED_REASONING.map((r) => [r.slice(0, 50), r] as const))(
    'does not discard a seat that quotes the error but reports it recovered: %s',
    (_label, reasoning) => {
      // The error string IS present — only the recovery guard keeps the seat.
      expect(UNVERIFIABLE_REASONING_RE.test(reasoning)).toBe(true);
      expect(classifyUnverifiable({ reasoning })).toBeUndefined();
    }
  );

  it('the error string with no recovery asserted still fires', () => {
    expect(classifyUnverifiable({ reasoning: ERROR_WITHOUT_RECOVERY })).toBe('reasoning');
  });

  it('the prefix fires on its own, even when the rest cites a line', () => {
    expect(UNVERIFIABLE_REASONING_RE.test(PREFIX_ONLY)).toBe(false);
    expect(classifyUnverifiable({ reasoning: PREFIX_ONLY })).toBe('reasoning');
  });

  it('stderr still wins over a reasoning that reports recovery', () => {
    expect(
      classifyUnverifiable({
        cliStderr: 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n',
        reasoning: RECOVERED_REASONING[0] as string,
      })
    ).toBe('stderr');
  });

  it('names which sub-rule fired', () => {
    const fired: string[] = [];
    const onRule = (rule: string): void => {
      fired.push(rule);
    };
    classifyUnverifiable({ reasoning: PREFIX_ONLY }, onRule);
    classifyUnverifiable({ reasoning: ERROR_WITHOUT_RECOVERY }, onRule);
    classifyUnverifiable({ reasoning: RECOVERED_REASONING[0] as string }, onRule);
    expect(fired).toEqual(['prefix', 'error_without_recovery']);
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

  it.each(LEDGER_FIXTURES.map((r, i) => [i, r] as const))(
    'still classifies ledger fixture %i through the recovery guard (#6104)',
    (_i, reasoning) => {
      expect(classifyUnverifiable({ reasoning })).toBe('reasoning');
    }
  );

  it('ordinary stderr chatter is not a signal', () => {
    expect(
      classifyUnverifiable({
        cliStderr: 'warning: model deprecated, use the newer alias\n',
        reasoning: 'Approve; reviewed the diff.',
      })
    ).toBeUndefined();
    expect(UNVERIFIABLE_STDERR_RE.test('warning: model deprecated')).toBe(false);
  });

  it.each(PARSE_FAILURE_ERRORS.map((r) => [r.slice(0, 60), r] as const))(
    'a response-parse failure has no citation and no recovery phrase and is still NOT unverifiable (#6244): %s',
    (_label, error) => {
      const rules: string[] = [];
      expect(
        classifyUnverifiable({ reasoning: error }, (rule) => rules.push(rule))
      ).toBeUndefined();
      expect(rules).toEqual([]);
    }
  );

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
