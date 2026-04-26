/**
 * Tests for the verification gate parser (#2233 Child 3).
 *
 * @module mcp/tools/pr-review-findings.test
 */

import { describe, it, expect } from 'vitest';
import {
  isFindingVerified,
  parseFindings,
  FINDINGS_FORMAT_INSTRUCTIONS,
  type VerificationGate,
} from './pr-review-findings.js';

const ALL_PASSED_GATE: VerificationGate = {
  reread_cited_line: 'passed',
  traced_call_path: 'passed',
  named_assertion: 'Concurrent setRefreshToken produces wrong final state',
  ruled_out_language_non_issue: 'passed',
};

describe('pr-review-findings', () => {
  describe('isFindingVerified', () => {
    it('returns true when all checks pass and named_assertion is substantive', () => {
      expect(isFindingVerified(ALL_PASSED_GATE)).toBe(true);
    });

    it('returns false when any check is skipped', () => {
      expect(isFindingVerified({ ...ALL_PASSED_GATE, traced_call_path: 'skipped' })).toBe(false);
    });

    it('returns false when any check is failed', () => {
      expect(
        isFindingVerified({ ...ALL_PASSED_GATE, ruled_out_language_non_issue: 'failed' })
      ).toBe(false);
    });

    it('returns false when named_assertion is too short (<10 chars)', () => {
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: 'short' })).toBe(false);
    });

    it('returns false for rubber-stamp named_assertion ("passed"/"OK"/etc)', () => {
      // The 2026-04-25 audit (#2225) found voters writing "passed" for everything
      // — the named_assertion field is the signal they actually thought about it.
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: 'passed' })).toBe(false);
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: 'OK' })).toBe(false);
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: 'verified' })).toBe(false);
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: '   yes   ' })).toBe(false);
    });

    it('returns false when named_assertion is empty', () => {
      expect(isFindingVerified({ ...ALL_PASSED_GATE, named_assertion: '' })).toBe(false);
    });
  });

  describe('parseFindings', () => {
    it('returns empty array when no findings block present', () => {
      const reasoning = 'I approve this PR. The diff looks correct and well-tested.';
      expect(parseFindings(reasoning)).toEqual([]);
    });

    it('returns empty array when findings block is empty', () => {
      const reasoning = `I have concerns.\n\n\`\`\`yaml findings\n\n\`\`\`\n`;
      expect(parseFindings(reasoning)).toEqual([]);
    });

    it('returns empty array when YAML is malformed', () => {
      const reasoning = `\`\`\`yaml findings\nthis: is: not: valid: yaml: at: all\n\`\`\``;
      expect(parseFindings(reasoning)).toEqual([]);
    });

    it('returns empty array when YAML is not an array', () => {
      const reasoning = `\`\`\`yaml findings\nsummary: just a string\n\`\`\``;
      expect(parseFindings(reasoning)).toEqual([]);
    });

    it('parses a single verified finding', () => {
      const reasoning = `Reasoning text.

\`\`\`yaml findings
- summary: 'Race condition in setRefreshToken'
  location: src/auth/session.ts:142
  severity: high
  gate:
    reread_cited_line: passed
    traced_call_path: passed
    named_assertion: 'Concurrent setRefreshToken calls produce wrong final state'
    ruled_out_language_non_issue: passed
  claim: 'Two awaits between read and write — TOCTOU window allows races.'
\`\`\``;
      const findings = parseFindings(reasoning);
      expect(findings).toHaveLength(1);
      const f = findings[0];
      expect(f).toBeDefined();
      if (f === undefined) return;
      expect(f.summary).toBe('Race condition in setRefreshToken');
      expect(f.location).toBe('src/auth/session.ts:142');
      expect(f.severity).toBe('high');
      expect(f.verified).toBe(true);
      expect(f.gate.named_assertion).toContain('Concurrent setRefreshToken');
    });

    it('parses multiple findings with mixed verification status', () => {
      const reasoning = `\`\`\`yaml findings
- summary: 'Real bug'
  location: src/a.ts:10
  severity: high
  gate:
    reread_cited_line: passed
    traced_call_path: passed
    named_assertion: 'Throws on null input — token-resolver.test.ts asserts non-throw'
    ruled_out_language_non_issue: passed
  claim: 'Null deref'
- summary: 'Suspicious pattern'
  location: src/b.ts:42
  severity: medium
  gate:
    reread_cited_line: skipped
    traced_call_path: passed
    named_assertion: 'passed'
    ruled_out_language_non_issue: passed
  claim: 'Could be safer'
\`\`\``;
      const findings = parseFindings(reasoning);
      expect(findings).toHaveLength(2);
      expect(findings[0]?.verified).toBe(true);
      expect(findings[1]?.verified).toBe(false);
    });

    it('drops findings missing required fields', () => {
      const reasoning = `\`\`\`yaml findings
- summary: ''
  location: src/a.ts:1
  severity: high
  gate:
    reread_cited_line: passed
    traced_call_path: passed
    named_assertion: 'A real failing assertion goes here'
    ruled_out_language_non_issue: passed
  claim: 'Missing summary'
- location: src/b.ts:2
  severity: high
  claim: 'Missing summary entirely'
\`\`\``;
      // Both findings should be dropped (one has empty summary, one has no
      // summary or gate field at all).
      expect(parseFindings(reasoning)).toEqual([]);
    });

    it('defaults missing severity to medium', () => {
      const reasoning = `\`\`\`yaml findings
- summary: 'No severity provided'
  location: src/x.ts:1
  gate:
    reread_cited_line: passed
    traced_call_path: passed
    named_assertion: 'Concrete failure description here for verification'
    ruled_out_language_non_issue: passed
  claim: 'something is wrong'
\`\`\``;
      const findings = parseFindings(reasoning);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.severity).toBe('medium');
    });

    it('handles boolean true/false in gate fields leniently', () => {
      const reasoning = `\`\`\`yaml findings
- summary: 'Bool gate'
  location: src/x.ts:1
  severity: low
  gate:
    reread_cited_line: true
    traced_call_path: true
    named_assertion: 'A specific assertion that would fail if this were a bug'
    ruled_out_language_non_issue: true
  claim: 'something'
\`\`\``;
      const findings = parseFindings(reasoning);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.gate.reread_cited_line).toBe('passed');
      expect(findings[0]?.verified).toBe(true);
    });
  });

  describe('FINDINGS_FORMAT_INSTRUCTIONS', () => {
    it('cites the verification gate (#2225)', () => {
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('#2225');
    });

    it('demands substantive named_assertion (>10 chars)', () => {
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('>10');
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('substantive');
    });

    it('warns that unverified findings do not block the merge', () => {
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('do not block');
    });

    it('shows the exact YAML format voters must produce', () => {
      // Sanity-check the example block has all 4 gate fields named.
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('reread_cited_line');
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('traced_call_path');
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('named_assertion');
      expect(FINDINGS_FORMAT_INSTRUCTIONS).toContain('ruled_out_language_non_issue');
    });
  });
});
