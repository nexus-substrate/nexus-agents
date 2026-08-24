/**
 * Tests for corroboration-validator.ts
 *
 * Validates that agent actions have sufficient evidence from authoritative
 * sources before execution.
 *
 * @module security/corroboration-validator.test
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { AgentAction, SourceCitation } from './action-schema.js';
import { validateCorroboration, getCorroborationRules } from './corroboration-validator.js';
import { getRequiredTrustTier } from './trust-classifier.js';

// ============================================================================
// Test Fixtures: Source Citations
// ============================================================================

const repoFile: SourceCitation = { type: 'repoFile', path: 'src/main.ts' };
const codeEvidence: SourceCitation = { type: 'repoFile', path: 'src/main.ts', line: 42 };
const ciPass: SourceCitation = { type: 'ciResult', runId: 1, status: 'pass', job: 'test' };
const maintainerCmd: SourceCitation = {
  type: 'maintainerCommand',
  username: 'admin',
  commentId: 1,
};
const tier1Comment: SourceCitation = {
  type: 'issueComment',
  issueNumber: 1,
  commentId: 1,
  author: 'admin',
  authorTrustTier: '1',
};
const tier2Comment: SourceCitation = {
  type: 'issueComment',
  issueNumber: 1,
  commentId: 2,
  author: 'contributor',
  authorTrustTier: '2',
};
const tier3Comment: SourceCitation = {
  type: 'issueComment',
  issueNumber: 1,
  commentId: 3,
  author: 'stranger',
  authorTrustTier: '3',
};
const policyDoc: SourceCitation = { type: 'policyDoc', path: 'CLAUDE.md', section: 'Security' };

// ============================================================================
// Test Fixtures: Action Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSummarize(sources: SourceCitation[]) {
  return { type: 'SummarizeIssue' as const, summary: 'Test summary', sources };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeProposeLabels(sources: SourceCitation[]) {
  return { type: 'ProposeLabels' as const, labels: ['bug'], reason: 'Test reason', sources };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDraftReply(sources: SourceCitation[]) {
  return {
    type: 'DraftReply' as const,
    body: 'Test reply',
    requiresApproval: true as const,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePatchPlan(sources: SourceCitation[]) {
  return {
    type: 'GeneratePatchPlan' as const,
    files: [{ path: 'src/main.ts', operation: 'modify' as const, description: 'Fix bug' }],
    rationale: 'Bug fix based on reproduction steps',
    requiresApproval: true as const,
    sources,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeClassify(sources: SourceCitation[]) {
  return { type: 'ClassifyIssue' as const, category: 'bug' as const, confidence: 0.9, sources };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeIdentifyDuplicates(sources: SourceCitation[]) {
  return { type: 'IdentifyDuplicates' as const, candidates: [1], similarity: [0.9], sources };
}

const requestApproval: AgentAction = {
  type: 'RequestHumanApproval',
  reason: 'Uncertain',
  context: 'Need human judgment',
};

const refuseAction: AgentAction = {
  type: 'RefuseAction',
  reason: 'Cannot proceed',
  escalateTo: 'maintainer',
};

// ============================================================================
// Tests: validateCorroboration()
// ============================================================================

describe('validateCorroboration', () => {
  describe('SummarizeIssue', () => {
    it('satisfied with Tier 1 source (repo file)', () => {
      const result = validateCorroboration(makeSummarize([repoFile]));
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.corroboratingSources).toContain(repoFile);
    });

    it('satisfied with Tier 2 source (collaborator comment)', () => {
      const result = validateCorroboration(makeSummarize([tier2Comment]));
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('not satisfied with only Tier 3 source', () => {
      const result = validateCorroboration(makeSummarize([tier3Comment]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('At least one Tier 1/2 source');
    });
  });

  describe('ProposeLabels', () => {
    it('satisfied with repo file reference', () => {
      const result = validateCorroboration(makeProposeLabels([repoFile]));
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('satisfied with maintainer command', () => {
      const result = validateCorroboration(makeProposeLabels([maintainerCmd]));
      expect(result.satisfied).toBe(true);
    });

    it('not satisfied with only CI source', () => {
      const result = validateCorroboration(makeProposeLabels([ciPass]));
      expect(result.satisfied).toBe(false);
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('satisfied with policy document', () => {
      const result = validateCorroboration(makeProposeLabels([policyDoc]));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('DraftReply', () => {
    it('satisfied with repo file', () => {
      const result = validateCorroboration(makeDraftReply([repoFile]));
      expect(result.satisfied).toBe(true);
    });

    it('satisfied with CI pass', () => {
      const result = validateCorroboration(makeDraftReply([ciPass]));
      expect(result.satisfied).toBe(true);
    });

    it('satisfied with maintainer command', () => {
      const result = validateCorroboration(makeDraftReply([maintainerCmd]));
      expect(result.satisfied).toBe(true);
    });

    it('satisfied with policy document', () => {
      const result = validateCorroboration(makeDraftReply([policyDoc]));
      expect(result.satisfied).toBe(true);
    });

    it('not satisfied with only Tier 3 comment', () => {
      const result = validateCorroboration(makeDraftReply([tier3Comment]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('At least one Tier 1 source citation');
    });

    it('satisfied with Tier 1 comment', () => {
      const result = validateCorroboration(makeDraftReply([tier1Comment]));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('GeneratePatchPlan', () => {
    it('satisfied with code evidence and maintainer command', () => {
      const result = validateCorroboration(makePatchPlan([codeEvidence, maintainerCmd]));
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('not satisfied without maintainer corroboration', () => {
      const result = validateCorroboration(makePatchPlan([codeEvidence, tier3Comment]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('Maintainer corroboration');
    });

    it('not satisfied without code evidence', () => {
      const result = validateCorroboration(makePatchPlan([maintainerCmd]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain(
        'Failing test OR bug reproduction steps (code-level evidence)'
      );
    });

    it('satisfied with CI pass and Tier 1 comment', () => {
      const result = validateCorroboration(makePatchPlan([ciPass, tier1Comment]));
      expect(result.satisfied).toBe(true);
    });
  });

  describe('ClassifyIssue', () => {
    it('satisfied with any source', () => {
      const result = validateCorroboration(makeClassify([repoFile]));
      expect(result.satisfied).toBe(true);
    });

    it('not satisfied with no sources', () => {
      const result = validateCorroboration(makeClassify([]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('At least one source citation');
    });
  });

  describe('IdentifyDuplicates', () => {
    it('satisfied with any source', () => {
      const result = validateCorroboration(makeIdentifyDuplicates([tier2Comment]));
      expect(result.satisfied).toBe(true);
    });

    it('not satisfied with no sources', () => {
      const result = validateCorroboration(makeIdentifyDuplicates([]));
      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('At least one source citation');
    });
  });

  describe('RequestHumanApproval and RefuseAction', () => {
    it('RequestHumanApproval always satisfied', () => {
      const result = validateCorroboration(requestApproval);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('RefuseAction always satisfied', () => {
      const result = validateCorroboration(refuseAction);
      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('corroboratingSources population', () => {
    it('includes all sources when requirements met', () => {
      const sources = [repoFile, ciPass, maintainerCmd];
      const result = validateCorroboration(makeSummarize(sources));
      expect(result.corroboratingSources).toHaveLength(3);
      expect(result.corroboratingSources).toContain(repoFile);
      expect(result.corroboratingSources).toContain(ciPass);
      expect(result.corroboratingSources).toContain(maintainerCmd);
    });

    it('empty when requirements not met', () => {
      const result = validateCorroboration(makeSummarize([tier3Comment]));
      expect(result.corroboratingSources).toHaveLength(0);
    });

    it('no duplicate sources', () => {
      const result = validateCorroboration(makePatchPlan([codeEvidence, maintainerCmd]));
      const uniqueSources = new Set(result.corroboratingSources);
      expect(result.corroboratingSources.length).toBe(uniqueSources.size);
    });
  });
});

// ============================================================================
// Tests: getCorroborationRules()
// ============================================================================

describe('getCorroborationRules', () => {
  it('returns 1 rule for SummarizeIssue', () => {
    const rules = getCorroborationRules('SummarizeIssue');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.description).toContain('Tier 1/2 source');
  });

  it('returns 2 rules for GeneratePatchPlan', () => {
    const rules = getCorroborationRules('GeneratePatchPlan');
    expect(rules).toHaveLength(2);
    expect(rules.some((r) => r.description.includes('code-level evidence'))).toBe(true);
    expect(rules.some((r) => r.description.includes('Maintainer corroboration'))).toBe(true);
  });

  it('returns empty array for RequestHumanApproval', () => {
    const rules = getCorroborationRules('RequestHumanApproval');
    expect(rules).toHaveLength(0);
  });

  it('returns empty array for RefuseAction', () => {
    const rules = getCorroborationRules('RefuseAction');
    expect(rules).toHaveLength(0);
  });
});

describe('the governance text matches the code (#4688)', () => {
  // `.rules/untrusted-input.md` said FOUR contradictory things about what
  // corroborates a typed action: "always cite Tier 1" (Mandatory Rule 2), "Tier
  // 1 or Tier 2" (the CLAUDE.md/AGENTS.md summary), a canonical POSITIVE
  // example citing Tier 3, and a Forbidden clause implying nothing below
  // GeneratePatchPlan needs corroboration.
  //
  // The implementation oscillated as a result — each swing was defensible
  // against the text a reviewer happened to read, and an adversarial review
  // reported the code as violating a rule whose own worked example did the
  // thing it called forbidden. A consensus vote resolved the reading; the code
  // already implemented it. These tests stop the texts drifting apart again.

  const RULES_DOC = readFileSync(
    resolve(import.meta.dirname, '../../../../.rules/untrusted-input.md'),
    'utf8'
  );

  const TYPED_ACTIONS = [
    'SummarizeIssue',
    'ProposeLabels',
    'DraftReply',
    'RequestHumanApproval',
    'ClassifyIssue',
    'IdentifyDuplicates',
    'RefuseAction',
    'GeneratePatchPlan',
  ] as const;

  /**
   * The action names in the FIRST COLUMN of the per-action table only.
   *
   * Parsing the column rather than searching the section matters: a first pass
   * of this test used `toContain` over the rest of the file and did not notice
   * a renamed table row, because the name still appeared in the worked
   * examples further down. A drift test that a rename walks past is decoration.
   */
  function documentedActions(): Set<string> {
    const section = RULES_DOC.slice(RULES_DOC.indexOf('## Per-Action Citation Floor'));
    const body = section.slice(0, section.indexOf('\n\n**'));
    const names = new Set<string>();
    for (const line of body.split('\n')) {
      if (!line.startsWith('|')) continue;
      const firstCell = line.split('|')[1];
      if (firstCell === undefined) continue;
      for (const m of firstCell.matchAll(/`([A-Za-z]+)`/g)) {
        if (m[1] !== undefined) names.add(m[1]);
      }
    }
    return names;
  }

  it('every typed action has a row in the citation-floor table', () => {
    const documented = documentedActions();
    expect(documented.size).toBeGreaterThan(0);
    for (const action of TYPED_ACTIONS) {
      expect(documented.has(action), `'${action}' has no row in the table`).toBe(true);
    }
  });

  it('the table documents no action that does not exist', () => {
    // Catches the other drift direction: a row left behind after an action is
    // renamed or removed would otherwise sit there looking authoritative.
    for (const documented of documentedActions()) {
      expect(
        (TYPED_ACTIONS as readonly string[]).includes(documented),
        `table documents '${documented}', which is not a typed action`
      ).toBe(true);
    }
  });

  /**
   * The two safety valves carry no corroboration requirement on purpose:
   * requiring evidence in order to refuse or escalate would make refusal
   * blockable, which is the opposite of failing closed. Named here so a THIRD
   * empty entry has to be added deliberately.
   */
  const NO_CORROBORATION_REQUIRED = new Set(['RequestHumanApproval', 'RefuseAction']);

  it('every typed action has corroboration rules in code', () => {
    // #4698-review: this asserted `toBeDefined()`, which could not fail —
    // ACTION_CORROBORATION_RULES is a total `Record<AgentActionType, ...>`, so
    // TypeScript already guarantees a value for every key and an action
    // registered with `[]` passed silently. Assert the rules are non-empty
    // instead, exempting the two that are deliberately empty.
    for (const action of TYPED_ACTIONS) {
      const rules = getCorroborationRules(action);
      if (NO_CORROBORATION_REQUIRED.has(action)) {
        expect(rules, `'${action}' is a safety valve and must stay unconditional`).toHaveLength(0);
        continue;
      }
      expect(rules.length, `'${action}' has an empty rules entry`).toBeGreaterThan(0);
    }
  });

  it('the documented fail-closed default matches the code', () => {
    // The AI/ML seat made this a condition of the vote: an action absent from
    // the table must get the STRICT floor, so the table fails closed on drift.
    expect(RULES_DOC).toMatch(/absent from the table gets the STRICT floor/i);
    expect(getRequiredTrustTier('SomeActionInventedTomorrow')).toBe('1');
  });

  it('documents that privilege-granting labels are never proposable', () => {
    // Shipped in #4689 as PRIVILEGED_LABEL. The rule is keyed on the action's
    // effect, not author trust, and the doc has to say so or the next reader
    // will "relax" it for trusted authors.
    expect(RULES_DOC).toContain('owner-ratified');
    expect(RULES_DOC).toMatch(/never proposable/i);
  });
});
