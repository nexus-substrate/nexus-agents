import { describe, expect, it } from 'vitest';

import { findMatchingKeyword, stripCodeLikeTokens } from './keyword-match.js';
import { SECURITY_KEYWORDS, ARCHITECTURE_KEYWORDS } from './gateway-keywords.js';

const sec = (text: string): string | undefined => findMatchingKeyword(text, SECURITY_KEYWORDS);
const arch = (text: string): string | undefined => findMatchingKeyword(text, ARCHITECTURE_KEYWORDS);

describe('stripCodeLikeTokens', () => {
  it('removes filenames so a path cannot classify the task', () => {
    expect(stripCodeLikeTokens('compare core.ts and security.ts')).not.toContain('security');
  });

  it('leaves ordinary prose intact', () => {
    expect(stripCodeLikeTokens('review the security model')).toContain('security');
  });
});

describe('security keyword matching', () => {
  it('does NOT fire on "author" (the #4518 reproduction)', () => {
    expect(sec('list the pull request author name and the merge date')).toBeUndefined();
  });

  it('does NOT fire on other auth-prefixed words', () => {
    for (const w of ['authored', 'authoring', 'authority', 'authoritative', 'authentic']) {
      expect(sec(`the ${w} source of truth`)).toBeUndefined();
    }
  });

  it('does NOT fire on a filename that merely contains a keyword', () => {
    expect(sec('why does src/exports/security.ts emit no page')).toBeUndefined();
  });

  it('still fires on the auth-family terms that are genuinely security', () => {
    // The trap in fixing #4518: a naive \bauth\b stops matching
    // "authentication"/"authorization", which is a FALSE NEGATIVE on the
    // governor path — strictly worse than the over-matching being fixed.
    for (const w of ['authentication', 'authorization', 'authn', 'authz', 'oauth']) {
      expect(sec(`harden the ${w} path`)).toBeDefined();
    }
  });

  it('still fires on genuine security work', () => {
    expect(sec('review the auth flow for this endpoint')).toBe('auth');
    expect(sec('patch the SQL injection in the query builder')).toBe('injection');
    expect(sec('rotate the leaked credentials')).toBe('credentials');
    expect(sec('threat model the new gateway')).toBe('threat');
  });

  it('honours deliberate stems rather than requiring an exact word', () => {
    // 'vulnerabilit' is a prefix on purpose — it must cover both inflections.
    expect(sec('a vulnerability in the parser')).toBe('vulnerabilit');
    expect(sec('several vulnerabilities were found')).toBe('vulnerabilit');
    expect(sec('tracking CVE-2026-1234')).toBe('cve-');
  });

  it('is case-insensitive', () => {
    expect(sec('SECURITY review requested')).toBe('security');
  });
});

describe('architecture keyword matching', () => {
  it('matches the regex-shaped entry against real prose', () => {
    // 'refactor.*system' was dead: substring matching could only ever match
    // the literal text "refactor.*system".
    expect(arch('refactor the pipeline system')).toBe('refactor.*system');
  });

  it('matches multi-word phrases', () => {
    expect(arch('this is a breaking change to the API')).toBe('breaking change');
  });

  it('does not fire on a substring collision', () => {
    // 'database' must not match inside an unrelated compound token.
    expect(arch('the ratabasement value')).toBeUndefined();
  });
});
