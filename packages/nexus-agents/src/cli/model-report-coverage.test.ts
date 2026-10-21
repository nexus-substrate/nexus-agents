/** Serving-report coverage must remain distinct from operational model attribution. */
import { describe, expect, it, vi } from 'vitest';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import {
  panelDiversityOf,
  singleModelPanelWarning,
  servedSubstitutions,
} from './vote-diversity.js';
import { modelsLine } from './vote-summary-lines.js';
import { reportVoteIndependence } from './panel-independence.js';
import { createLogger } from '../core/index.js';

function rows(reports: readonly (string | undefined)[]): AgentVoteResult[] {
  const roles: readonly VoterRole[] = ['architect', 'security', 'scope_steward'];
  return reports.map((servedModel, index) => {
    const role = roles[index];
    if (role === undefined) throw new Error('Too many fixture seats');
    return {
      role,
      source: 'llm',
      processingTimeMs: 1,
      vote: { decision: 'approve', confidence: 0.9, reasoning: 'Offline coverage fixture' },
      cli: 'claude',
      model: 'claude-fable-5',
      operationalModel: 'opus',
      ...(servedModel === undefined ? {} : { servedModel }),
    };
  });
}

describe('serving model report coverage', () => {
  it.each([
    { reports: [] as (string | undefined)[], reported: 0, total: 0 },
    { reports: [undefined, undefined, undefined], reported: 0, total: 3 },
    { reports: ['opus', undefined, undefined], reported: 1, total: 3 },
    { reports: ['opus', 'opus', 'opus'], reported: 3, total: 3 },
  ])(
    'reports $reported/$total independently of selection diversity',
    ({ reports, reported, total }) => {
      const diversity = panelDiversityOf(rows(reports));
      expect(diversity).toMatchObject({ reportCoverage: { reported, total } });
      expect(diversity.distinctModels).toBe(total === 0 ? 0 : 1);
    }
  );

  it('labels unreported model attribution without claiming a measured serving model', () => {
    const votes = rows([undefined, undefined, undefined]);
    expect(singleModelPanelWarning(votes)).toContain('attributed');
    expect(singleModelPanelWarning(votes)).toContain('0/3');
    expect(modelsLine(votes)).toContain('reports 0/3');
    expect(servedSubstitutions(votes)).toEqual([]);
  });

  it('discloses partial report coverage', () => {
    const votes = rows(['opus', undefined, undefined]);
    expect(singleModelPanelWarning(votes)).toContain('1/3');
    expect(modelsLine(votes)).toContain('reports 1/3');
  });

  it('labels complete reporting as reports, not independent identity attestation', () => {
    const votes = rows(['opus', 'opus', 'opus']);
    expect(singleModelPanelWarning(votes)).toContain('reported');
    expect(modelsLine(votes)).toContain('reports 3/3');
  });

  it('does not log model independence from configured-only identities', () => {
    const logger = createLogger({ component: 'coverage-control' });
    const warning = vi.spyOn(logger, 'warn');
    reportVoteIndependence(rows([undefined, undefined, undefined]), logger);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('UNMEASURED'), expect.any(Object));
  });
});
