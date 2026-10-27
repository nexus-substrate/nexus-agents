/** Legacy byte hashes captured independently from committed a475 before this change. */
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import * as sanitizer from '../middleware/tool-input-sanitizer.js';
import { createLogger } from '../../core/index.js';
import { buildPrReviewProposal, buildPrReviewProposalResult } from './pr-review-proposal.js';
import { preparePanelProposal } from './pr-review-panel-budget.js';

const clean = {
  prTitle: 'TEST_FAKE clean',
  prDescription: 'Benign description',
  prDiff: 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1 @@\n+KEEP\n',
  repoContext: 'Owned fixture',
  baseRef: 'main',
  headRef: 'TEST_FAKE',
  simulate: true,
};
const prior = { comments: 2, fields: 2, tags: 1 };
const own = { ...clean, prDiff: clean.prDiff + '<!-- TEST_FAKE comment -->\n' };
const all = {
  ...clean,
  prTitle: 'Title <!-- title --> KEEP',
  prDescription: 'Description <!-- description --> KEEP',
  prDiff: clean.prDiff + '<!-- diff -->\n',
  repoContext: 'Context <!-- context --> KEEP',
};
const canonical =
  'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1,2 @@\n+' +
  'x'.repeat(51000) +
  '\n+TEST_FAKE_TAIL\n';
const vectors = [
  { name: 'clean-default', input: clean, removed: undefined },
  { name: 'clean-explicit-zero', input: clean, removed: { comments: 0, fields: 0, tags: 0 } },
  { name: 'own-only', input: own, removed: undefined },
  { name: 'prior-only', input: clean, removed: prior },
  { name: 'mixed', input: own, removed: prior },
  { name: 'all-four-fields', input: all, removed: undefined },
  {
    name: 'unicode',
    input: {
      ...all,
      prTitle: 'TEST_FAKE 😀 café <!-- unicode -->',
      prDiff: clean.prDiff + '+日本語 😀 é <!-- unicode-diff -->\n',
    },
    removed: undefined,
  },
  {
    name: 'local-prefix-marker',
    input: { ...clean, prDiff: canonical.slice(0, 50000) + '\n[...truncated]' },
    removed: undefined,
  },
];
const GOLDENS: ReadonlyArray<readonly [string, string, string]> = [
  [
    'clean-default',
    'e259d15e0dc85fcf51ccd6edbefa42b19ffc41304358a773ee9fb88d2d2a32e0',
    'e259d15e0dc85fcf51ccd6edbefa42b19ffc41304358a773ee9fb88d2d2a32e0',
  ],
  [
    'clean-explicit-zero',
    'e259d15e0dc85fcf51ccd6edbefa42b19ffc41304358a773ee9fb88d2d2a32e0',
    'e259d15e0dc85fcf51ccd6edbefa42b19ffc41304358a773ee9fb88d2d2a32e0',
  ],
  [
    'own-only',
    'd09d293c52ff39c67e11f0542ef34ef5cb8f886e456e4dd091f5f082a667c930',
    'd09d293c52ff39c67e11f0542ef34ef5cb8f886e456e4dd091f5f082a667c930',
  ],
  [
    'prior-only',
    'ade48c30d53b900e513bcbc60356ae1719f080927aa53fdfd824feb0201066f9',
    'e259d15e0dc85fcf51ccd6edbefa42b19ffc41304358a773ee9fb88d2d2a32e0',
  ],
  [
    'mixed',
    '3087fe1840472462fb5e7a14f2ad75ee486199bcad657afce24e86ac0ffbac5c',
    'd09d293c52ff39c67e11f0542ef34ef5cb8f886e456e4dd091f5f082a667c930',
  ],
  [
    'all-four-fields',
    '2deb60e9f0701a973376eab6345f9e09cd313e29d415bb902745ed13f9060574',
    '2deb60e9f0701a973376eab6345f9e09cd313e29d415bb902745ed13f9060574',
  ],
  [
    'unicode',
    '69bc9bf8cf90c192197c81b3d491acabe2e87372b2c9c58b25fbd4dbeb50359f',
    '69bc9bf8cf90c192197c81b3d491acabe2e87372b2c9c58b25fbd4dbeb50359f',
  ],
  [
    'local-prefix-marker',
    '556bd42a2415c5582aa673aa7ac7c7e8d2614ed3c691eaa4cc21e65e34de51f1',
    'fc08605f1b3d852af0cdd7a22e764dff50eb4e212e9058ee8ff2f4061822158f',
  ],
];
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('single canonical proposal engine and legacy contracts', () => {
  it('reports actual sanitizer exhaustion separately from a successful strip', () => {
    const nested = '<sys'.repeat(6) + '<system>' + 'tem>'.repeat(6) + 'TEST_FAKE';
    const result = buildPrReviewProposalResult({ ...clean, prDiff: nested });
    expect(result.builderSanitization.sanitizationIncomplete).toBe(true);
    expect(result.builderSanitization.wasModified).toBe(true);
    expect(result.builderSanitization.modifiedCount).toBe(1);
  });

  it.each(vectors)('preserves exact pre-change string and real MCP packing bytes: $name', (v) => {
    const golden = GOLDENS.find(([name]) => name === v.name);
    if (golden === undefined) throw new Error('Missing original byte oracle');
    const spy = vi.spyOn(sanitizer, 'sanitizeToolInput');
    try {
      const legacy =
        v.removed === undefined
          ? buildPrReviewProposal(v.input)
          : buildPrReviewProposal(v.input, v.removed);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(hash(legacy)).toBe(golden[1]);
      expect(buildPrReviewProposalResult(v.input, v.removed).proposal).toBe(legacy);
      const packed = preparePanelProposal(
        { ...v.input, dispatch: 'sync', errorPolicy: 'standard' },
        { simulate: true, seats: undefined },
        undefined,
        createLogger({ component: 'TEST_FAKE-proposal-parity' }),
        {
          getEntry: () => {
            throw new Error('No live registry lookup');
          },
        }
      );
      expect(hash(packed.proposal)).toBe(golden[2]);
    } finally {
      spy.mockRestore();
    }
  });

  it.each(['prTitle', 'prDescription', 'prDiff', 'repoContext'] as const)(
    'observes actual own removal in %s, without attributing inherited counts',
    (field) => {
      const input = { ...clean, [field]: clean[field] + '<!-- TEST_FAKE -->' };
      const result = buildPrReviewProposalResult(input, prior);
      expect(result.builderSanitization).toEqual({
        commentsRemoved: 1,
        tagsRemoved: 0,
        modifiedCount: 1,
        wasModified: true,
        sanitizationIncomplete: false,
      });
      expect(Object.isFrozen(result.builderSanitization)).toBe(true);
      expect(result.proposal).toContain('3 HTML comment(s)');
    }
  );

  it('distinguishes measured clean from inherited-only notes and returns copied facts', () => {
    const result = buildPrReviewProposalResult(clean, prior);
    expect(result.builderSanitization).toEqual({
      commentsRemoved: 0,
      tagsRemoved: 0,
      modifiedCount: 0,
      wasModified: false,
      sanitizationIncomplete: false,
    });
    expect(result.proposal).toContain('2 HTML comment(s)');
    expect(Object.keys(result.builderSanitization).sort()).toEqual([
      'commentsRemoved',
      'modifiedCount',
      'sanitizationIncomplete',
      'tagsRemoved',
      'wasModified',
    ]);
  });

  it('measures multiple own fields jointly and keeps tag totals separate', () => {
    const result = buildPrReviewProposalResult(
      { ...all, repoContext: '<system>TEST_FAKE</system>' },
      prior
    );
    expect(result.builderSanitization).toEqual({
      commentsRemoved: 3,
      tagsRemoved: 2,
      modifiedCount: 4,
      wasModified: true,
      sanitizationIncomplete: false,
    });
    expect(result.proposal).toContain('5 HTML comment(s)');
    expect(result.proposal).toContain('3 XML-like tag(s)');
  });
});
