/**
 * Tests for repo-security-plan logic.
 * (Source: Issue #1079)
 */

import { describe, it, expect } from 'vitest';
import { buildPlanFromAnalysis } from './repo-security-plan.js';
import { FALLBACK_SCANNER_DATA } from './repo-security-plan-fallback.js';
import type { RepoAnalysis } from './repo-analyze-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeAnalysis(overrides: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    name: 'test/repo',
    language: 'TypeScript',
    framework: null,
    packageManager: 'npm',
    ciProvider: 'github-actions',
    securityTooling: [],
    hasDockerfile: false,
    hasHelmCharts: false,
    hasMakefile: false,
    hasTests: true,
    license: 'MIT',
    description: 'Test repo',
    defaultBranch: 'main',
    stars: 10,
    topLevelEntries: [],
    gaps: [],
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('buildPlanFromAnalysis', () => {
  it('returns recommendations for TypeScript project', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo' });

    expect(plan.repo).toBe('test/repo');
    expect(plan.language).toBe('TypeScript');
    expect(plan.recommendations.length).toBeGreaterThan(0);

    const names = plan.recommendations.map((r) => r.name);
    expect(names).toContain('semgrep');
    expect(names).toContain('npm-audit');
    expect(names).toContain('gitleaks');
  });

  it('normalizes lowercase language names from repo_analyze (#1182)', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ language: 'typescript' }), {
      repo: 'test/repo',
    });

    expect(plan.recommendations.length).toBeGreaterThan(0);
    const names = plan.recommendations.map((r) => r.name);
    expect(names).toContain('semgrep');
  });

  it('returns recommendations for Python project', () => {
    const plan = buildPlanFromAnalysis(
      makeAnalysis({ language: 'Python', packageManager: 'pip' }),
      { repo: 'test/py-repo' }
    );

    const names = plan.recommendations.map((r) => r.name);
    expect(names).toContain('bandit');
    expect(names).toContain('pip-audit');
    expect(names).toContain('gitleaks');
  });

  it('returns recommendations for Go project', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ language: 'Go', packageManager: 'go' }), {
      repo: 'test/go-repo',
    });

    const names = plan.recommendations.map((r) => r.name);
    expect(names).toContain('gosec');
    expect(names).toContain('govulncheck');
  });

  it('skips scanners already in use', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ securityTooling: ['semgrep', 'gitleaks'] }), {
      repo: 'test/repo',
    });

    const names = plan.recommendations.map((r) => r.name);
    expect(names).not.toContain('semgrep');
    expect(names).not.toContain('gitleaks');
  });

  it('adds container scanning when Dockerfile present and grype not already recommended', () => {
    // With language=null, no language-specific SCA recs (so grype not already added)
    const plan = buildPlanFromAnalysis(makeAnalysis({ hasDockerfile: true, language: null }), {
      repo: 'test/repo',
    });

    const containerRecs = plan.recommendations.filter((r) => r.category === 'container');
    expect(containerRecs.length).toBeGreaterThan(0);
    expect(containerRecs[0]?.name).toBe('grype');
  });

  it('skips duplicate grype when already recommended for SCA', () => {
    // TypeScript adds osv-scanner via SCA; Dockerfile should not add a duplicate
    const plan = buildPlanFromAnalysis(
      makeAnalysis({ hasDockerfile: true, language: 'TypeScript' }),
      { repo: 'test/repo' }
    );

    const grypeRecs = plan.recommendations.filter((r) => r.name === 'grype');
    expect(grypeRecs.length).toBe(1);
  });

  it('adds IaC scanning when Helm charts present', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ hasHelmCharts: true }), {
      repo: 'test/repo',
    });

    const iacRecs = plan.recommendations.filter((r) => r.category === 'iac');
    expect(iacRecs.length).toBeGreaterThan(0);
    expect(iacRecs[0]?.name).toBe('checkov');
  });

  it('respects category filter', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo', categories: ['sast'] });

    for (const rec of plan.recommendations) {
      expect(rec.category).toBe('sast');
    }
  });

  it('respects maxScanners limit', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo', maxScanners: 2 });

    expect(plan.recommendations.length).toBeLessThanOrEqual(2);
  });

  it('generates CI snippets for github-actions', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ ciProvider: 'github-actions' }), {
      repo: 'test/repo',
    });

    const withSnippets = plan.recommendations.filter((r) => r.ciSnippet !== null);
    expect(withSnippets.length).toBeGreaterThan(0);
  });

  it('returns null CI snippets for non-github-actions', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ ciProvider: 'gitlab-ci' }), {
      repo: 'test/repo',
    });

    for (const rec of plan.recommendations) {
      expect(rec.ciSnippet).toBeNull();
    }
  });

  it('produces coverage analysis for standard categories', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo' });

    const categories = plan.coverage.map((c) => c.category);
    expect(categories).toContain('sast');
    expect(categories).toContain('sca');
    expect(categories).toContain('secrets');
    expect(categories).toContain('container');
    expect(categories).toContain('iac');
    expect(categories).toContain('dast');
  });

  it('returns empty recommendations for unknown language', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ language: null }), { repo: 'test/repo' });

    expect(plan.recommendations.length).toBe(0);
  });

  it('marks first SAST scanner as critical priority', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo' });

    const sast = plan.recommendations.filter((r) => r.category === 'sast');
    expect(sast[0]?.priority).toBe('critical');
  });

  it('includes existing gaps in gapsSummary', () => {
    const plan = buildPlanFromAnalysis(
      makeAnalysis({ gaps: ['No CI/CD configuration detected'] }),
      { repo: 'test/repo' }
    );

    expect(plan.gapsSummary).toContain('No CI/CD configuration detected');
  });

  it('flags uncovered categories in gapsSummary', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ language: null }), { repo: 'test/repo' });

    const uncovered = plan.gapsSummary.find((g) => g.startsWith('Uncovered'));
    expect(uncovered).toBeDefined();
  });

  it('adds image-currency recommendation when Dockerfile is present', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ hasDockerfile: true, language: null }), {
      repo: 'test/repo',
    });

    const imageCurrencyRecs = plan.recommendations.filter((r) => r.category === 'image-currency');
    expect(imageCurrencyRecs.length).toBe(1);
    expect(imageCurrencyRecs[0]?.name).toBe('grype-image');
  });

  it('image-currency rationale mentions severity filtering and pinned tags', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ hasDockerfile: true, language: null }), {
      repo: 'test/repo',
    });

    const rec = plan.recommendations.find((r) => r.name === 'grype-image');
    expect(rec?.rationale).toContain('CRITICAL,HIGH');
    expect(rec?.rationale).toContain(':latest');
    expect(rec?.rationale).toContain('Alpine');
  });

  it('image-currency recommendation has CI snippet for github-actions', () => {
    const plan = buildPlanFromAnalysis(
      makeAnalysis({ hasDockerfile: true, language: null, ciProvider: 'github-actions' }),
      { repo: 'test/repo' }
    );

    const rec = plan.recommendations.find((r) => r.name === 'grype-image');
    expect(rec?.ciSnippet).not.toBeNull();
    expect(rec?.ciSnippet).toContain('image:');
    expect(rec?.ciSnippet).toContain('severity: CRITICAL,HIGH');
  });

  it('does not add image-currency when Dockerfile is absent', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis({ hasDockerfile: false, language: null }), {
      repo: 'test/repo',
    });

    const imageCurrencyRecs = plan.recommendations.filter((r) => r.category === 'image-currency');
    expect(imageCurrencyRecs.length).toBe(0);
  });

  it('coverage includes image-currency category', () => {
    const plan = buildPlanFromAnalysis(makeAnalysis(), { repo: 'test/repo' });

    const categories = plan.coverage.map((c) => c.category);
    expect(categories).toContain('image-currency');
  });

  // #2732: drift gate — every scanner that the recommendation flow can surface
  // must have a github-actions CI snippet, otherwise consumers get null and
  // can't bootstrap CI. Pre-fix, 4 of the TypeScript recommendations returned
  // ciSnippet: null because the CI_SNIPPETS map was a manual subset of the
  // fallback registry.
  it('every fallback scanner produces a non-null ciSnippet on github-actions', () => {
    const missingByScanner: string[] = [];

    for (const scanner of FALLBACK_SCANNER_DATA.scanners) {
      // Pick a language whose recommendations include this scanner so the
      // plan actually surfaces it. Falls back to TypeScript otherwise — the
      // wiring goes through the same generateCiSnippet path regardless.
      const language =
        Object.entries(FALLBACK_SCANNER_DATA.languageMap).find(([, recs]) =>
          [...recs.sast, ...recs.sca, ...recs.secrets].includes(scanner.name)
        )?.[0] ?? 'TypeScript';

      const plan = buildPlanFromAnalysis(
        makeAnalysis({ language, hasDockerfile: scanner.name.startsWith('grype') }),
        { repo: 'test/repo' }
      );

      const rec = plan.recommendations.find((r) => r.name === scanner.name);
      if (rec?.ciSnippet === null) {
        missingByScanner.push(scanner.name);
      }
    }

    expect(missingByScanner).toEqual([]);
  });
});
