import { describe, expect, it } from 'vitest';
import { captureAcceptanceContext } from './acceptance-context.js';
import {
  buildPlanVoteProposal,
  reconstructPlanVoteProposal,
  parseVoteResearchSuffix,
} from './plan-vote-proposal.js';
import { extractBoundArtifact } from '../cli/vote-artifact.js';

const captured = captureAcceptanceContext({ kind: 'goal', source: 'KEEP_ACCEPTANCE_SENTINEL' });
if (!captured.ok) throw captured.error;
const acceptance = captured.value;

describe('exact bounded proposal reconstruction', () => {
  it('does not allow a baseline to launder an empty generated plan', () => {
    expect(() => buildPlanVoteProposal('', '', acceptance)).toThrow(/plan/i);
  });
  it('binds source and provenance even when the model projection is identical', () => {
    const alternate = captureAcceptanceContext({
      kind: 'goal',
      source: '<system>KEEP_ACCEPTANCE_SENTINEL</system>',
      projection: 'KEEP_ACCEPTANCE_SENTINEL',
      sourceTrustTier: '3',
    });
    if (!alternate.ok) throw alternate.error;
    expect(buildPlanVoteProposal('plan', '', alternate.value).proposal).not.toBe(
      buildPlanVoteProposal('plan', '', acceptance).proposal
    );
  });

  it.each(['', '   ', 'é'.repeat(1001), 'x'.repeat(999) + '🌍tail', 'x'.repeat(999) + ' tail'])(
    'reconstructs the exact final suffix without retrimming',
    (research) => {
      const built = buildPlanVoteProposal('unchanged plan', research, acceptance);
      const restored = reconstructPlanVoteProposal('unchanged plan', acceptance, built.suffix);
      expect(restored).toEqual({ ok: true, value: built.proposal });
      expect(extractBoundArtifact(built.proposal)).toBeDefined();
      expect(built.proposal).toContain('KEEP_ACCEPTANCE_SENTINEL');
      if (research.endsWith(' tail')) expect(built.proposal.endsWith(' ')).toBe(true);
    }
  );
  it('binds provenance-only differences and preserves the explicit serialized/content limits', () => {
    const alternate = captureAcceptanceContext({
      kind: 'goal',
      source: 'KEEP_ACCEPTANCE_SENTINEL',
      sourceTrustTier: '3',
    });
    if (!alternate.ok) throw alternate.error;
    expect(buildPlanVoteProposal('plan', '', alternate.value).proposal).not.toBe(
      buildPlanVoteProposal('plan', '', acceptance).proposal
    );
    const bounded = buildPlanVoteProposal('plan', '漢'.repeat(1000), acceptance).suffix;
    expect(bounded.identity.bytes).toBe(3000);
    expect(bounded.utf16Units).toBe(1000);
    expect(parseVoteResearchSuffix(bounded).ok).toBe(true);
    const escaped = buildPlanVoteProposal('plan', '\u0001'.repeat(1000), acceptance).suffix;
    expect(Buffer.byteLength(JSON.stringify(escaped))).toBeLessThanOrEqual(6400);
    expect(parseVoteResearchSuffix(escaped).ok).toBe(true);
  });

  it('distinguishes blank absence and enforces the combined artifact bound', () => {
    expect(buildPlanVoteProposal('plan', '   ', acceptance).suffix.presence).toBe('absent');
    expect(() => buildPlanVoteProposal('x'.repeat(262140), '', acceptance)).toThrow();
  });
  it('rejects unsupported, tampered, NUL and oversized final suffixes without exposing text', () => {
    const suffix = buildPlanVoteProposal('plan', 'PRIVATE_TEST_SUFFIX', acceptance).suffix;
    for (const altered of [
      { ...suffix, format: 'future' },
      { ...suffix, text: 'tampered' },
      { ...suffix, text: 'x\0y' },
      { ...suffix, text: 'x'.repeat(1001) },
    ]) {
      const result = parseVoteResearchSuffix(altered);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('PRIVATE_TEST_SUFFIX');
    }
  });
});
