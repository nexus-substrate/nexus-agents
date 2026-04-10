/**
 * Unit tests for repo-analyze.ts core logic functions.
 *
 * Tests pure functions: normalizeRepoId, detectPackageManager,
 * detectCiProvider, detectSecurityTooling, detectFramework,
 * getLanguageRecommendations, identifyGaps, analyzeRepo.
 *
 * @module mcp/tools/repo-analyze.test
 * (Issue #1340)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeRepoId,
  detectPackageManager,
  detectCiProvider,
  detectSecurityTooling,
  detectFramework,
  getLanguageRecommendations,
  identifyGaps,
  analyzeRepo,
  type GhRepoMetadata,
} from './repo-analyze.js';

// ============================================================================
// normalizeRepoId
// ============================================================================

describe('normalizeRepoId', () => {
  it('returns owner/repo from plain format', () => {
    expect(normalizeRepoId('owner/repo')).toBe('owner/repo');
  });

  it('extracts owner/repo from full GitHub URL', () => {
    expect(normalizeRepoId('https://github.com/owner/repo')).toBe('owner/repo');
  });

  it('extracts owner/repo from GitHub URL with .git suffix', () => {
    expect(normalizeRepoId('https://github.com/owner/repo.git')).toBe('owner/repo');
  });

  it('extracts owner/repo from URL with trailing slash', () => {
    expect(normalizeRepoId('https://github.com/owner/repo/')).toBe('owner/repo');
  });

  it('extracts owner/repo from URL with subpaths', () => {
    expect(normalizeRepoId('https://github.com/owner/repo/tree/main')).toBe('owner/repo');
  });

  it('throws on invalid format — single word', () => {
    expect(() => normalizeRepoId('justarepo')).toThrow('Invalid repo format');
  });

  it('throws on empty string', () => {
    expect(() => normalizeRepoId('')).toThrow('Invalid repo format');
  });

  it('throws on nested path without github.com', () => {
    expect(() => normalizeRepoId('a/b/c')).toThrow('Invalid repo format');
  });
});

// ============================================================================
// detectPackageManager
// ============================================================================

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    expect(detectPackageManager(['pnpm-lock.yaml', 'package.json'])).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    expect(detectPackageManager(['yarn.lock', 'package.json'])).toBe('yarn');
  });

  it('detects npm from package-lock.json', () => {
    expect(detectPackageManager(['package-lock.json', 'package.json'])).toBe('npm');
  });

  it('detects cargo from Cargo.toml', () => {
    expect(detectPackageManager(['Cargo.toml', 'src'])).toBe('cargo');
  });

  it('detects go from go.mod', () => {
    expect(detectPackageManager(['go.mod', 'main.go'])).toBe('go');
  });

  it('detects pip from requirements.txt', () => {
    expect(detectPackageManager(['requirements.txt'])).toBe('pip');
  });

  it('detects pip from pyproject.toml', () => {
    expect(detectPackageManager(['pyproject.toml'])).toBe('pip');
  });

  it('detects bundler from Gemfile', () => {
    expect(detectPackageManager(['Gemfile'])).toBe('bundler');
  });

  it('detects maven from pom.xml', () => {
    expect(detectPackageManager(['pom.xml', 'src'])).toBe('maven');
  });

  it('detects gradle from build.gradle', () => {
    expect(detectPackageManager(['build.gradle'])).toBe('gradle');
  });

  it('detects gradle from build.gradle.kts', () => {
    expect(detectPackageManager(['build.gradle.kts'])).toBe('gradle');
  });

  it('returns null when no manager detected', () => {
    expect(detectPackageManager(['README.md', 'src'])).toBeNull();
  });

  it('returns first match — pnpm beats npm', () => {
    expect(detectPackageManager(['pnpm-lock.yaml', 'package-lock.json', 'package.json'])).toBe(
      'pnpm'
    );
  });

  it('handles empty entries', () => {
    expect(detectPackageManager([])).toBeNull();
  });
});

// ============================================================================
// detectCiProvider
// ============================================================================

describe('detectCiProvider', () => {
  it('detects github-actions from .github', () => {
    expect(detectCiProvider(['.github', 'src'])).toBe('github-actions');
  });

  it('detects gitlab-ci from .gitlab-ci.yml', () => {
    expect(detectCiProvider(['.gitlab-ci.yml'])).toBe('gitlab-ci');
  });

  it('detects jenkins from Jenkinsfile', () => {
    expect(detectCiProvider(['Jenkinsfile'])).toBe('jenkins');
  });

  it('detects circleci from .circleci', () => {
    expect(detectCiProvider(['.circleci'])).toBe('circleci');
  });

  it('detects travis from .travis.yml', () => {
    expect(detectCiProvider(['.travis.yml'])).toBe('travis');
  });

  it('detects azure-devops from azure-pipelines.yml', () => {
    expect(detectCiProvider(['azure-pipelines.yml'])).toBe('azure-devops');
  });

  it('detects concourse', () => {
    expect(detectCiProvider(['concourse'])).toBe('concourse');
  });

  it('returns null when no CI detected', () => {
    expect(detectCiProvider(['src', 'README.md'])).toBeNull();
  });

  it('returns first match — github-actions wins', () => {
    expect(detectCiProvider(['.github', '.gitlab-ci.yml'])).toBe('github-actions');
  });
});

// ============================================================================
// detectSecurityTooling
// ============================================================================

describe('detectSecurityTooling', () => {
  it('detects semgrep from .semgrep.yml', () => {
    expect(detectSecurityTooling(['.semgrep.yml'])).toContain('semgrep');
  });

  it('detects semgrep from .semgrep directory', () => {
    expect(detectSecurityTooling(['.semgrep'])).toContain('semgrep');
  });

  it('detects snyk from .snyk', () => {
    expect(detectSecurityTooling(['.snyk'])).toContain('snyk');
  });

  it('detects security-policy from SECURITY.md', () => {
    expect(detectSecurityTooling(['SECURITY.md'])).toContain('security-policy');
  });

  it('detects grype from .grype.yaml', () => {
    expect(detectSecurityTooling(['.grype.yaml'])).toContain('grype');
  });

  it('detects codeowners from CODEOWNERS', () => {
    expect(detectSecurityTooling(['CODEOWNERS'])).toContain('codeowners');
  });

  it('detects multiple tools at once', () => {
    const tools = detectSecurityTooling(['.semgrep.yml', 'SECURITY.md', 'CODEOWNERS']);
    expect(tools).toHaveLength(3);
    expect(tools).toContain('semgrep');
    expect(tools).toContain('security-policy');
    expect(tools).toContain('codeowners');
  });

  it('returns empty array when no tools detected', () => {
    expect(detectSecurityTooling(['src', 'package.json'])).toEqual([]);
  });
});

// ============================================================================
// detectFramework
// ============================================================================

describe('detectFramework', () => {
  it('detects helmfile', () => {
    expect(detectFramework(['helmfile.yaml'])).toBe('helmfile');
  });

  it('detects helmfile from gotmpl variant', () => {
    expect(detectFramework(['helmfile.yaml.gotmpl'])).toBe('helmfile');
  });

  it('detects nextjs from next.config.js', () => {
    expect(detectFramework(['next.config.js', 'package.json'])).toBe('nextjs');
  });

  it('detects nextjs from next.config.ts', () => {
    expect(detectFramework(['next.config.ts', 'package.json'])).toBe('nextjs');
  });

  it('detects angular from angular.json', () => {
    expect(detectFramework(['angular.json', 'package.json'])).toBe('angular');
  });

  it('detects vite from vite.config.ts', () => {
    expect(detectFramework(['vite.config.ts', 'package.json'])).toBe('vite');
  });

  it('detects vite from vite.config.js', () => {
    expect(detectFramework(['vite.config.js'])).toBe('vite');
  });

  it('detects typescript from tsconfig.json + package.json', () => {
    expect(detectFramework(['tsconfig.json', 'package.json'])).toBe('typescript');
  });

  it('does not detect typescript from tsconfig.json alone', () => {
    expect(detectFramework(['tsconfig.json'])).toBeNull();
  });

  it('returns null when no framework detected', () => {
    expect(detectFramework(['src', 'README.md'])).toBeNull();
  });

  it('first match wins — helmfile beats nextjs', () => {
    expect(detectFramework(['helmfile.yaml', 'next.config.js'])).toBe('helmfile');
  });
});

// ============================================================================
// getLanguageRecommendations
// ============================================================================

describe('getLanguageRecommendations', () => {
  it('returns SAST and SCA recommendations for TypeScript without security tooling', () => {
    const recs = getLanguageRecommendations('TypeScript', []);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toContain('SAST');
    expect(recs[1]).toContain('SCA');
  });

  it('skips SAST recommendation when semgrep is present', () => {
    const recs = getLanguageRecommendations('TypeScript', ['semgrep']);
    expect(recs.some((r) => r.includes('SAST'))).toBe(false);
    expect(recs.some((r) => r.includes('SCA'))).toBe(true);
  });

  it('skips SCA recommendation when osv-scanner or grype is present', () => {
    const recs = getLanguageRecommendations('TypeScript', ['osv-scanner']);
    expect(recs.some((r) => r.includes('SAST'))).toBe(true);
    expect(recs.some((r) => r.includes('SCA'))).toBe(false);
  });

  it('returns empty when snyk covers both SAST and SCA', () => {
    const recs = getLanguageRecommendations('TypeScript', ['snyk']);
    expect(recs).toHaveLength(0);
  });

  it('returns empty for null language', () => {
    expect(getLanguageRecommendations(null, [])).toEqual([]);
  });

  it('returns empty for unknown language', () => {
    expect(getLanguageRecommendations('Brainfuck', [])).toEqual([]);
  });

  it('returns recommendations for Python', () => {
    const recs = getLanguageRecommendations('Python', []);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toContain('Python');
    expect(recs[0]).toContain('bandit');
  });

  it('returns recommendations for Go', () => {
    const recs = getLanguageRecommendations('Go', []);
    expect(recs.some((r) => r.includes('gosec'))).toBe(true);
  });

  it('returns recommendations for Shell — SCA empty', () => {
    const recs = getLanguageRecommendations('Shell', []);
    expect(recs).toHaveLength(1); // Only SAST, no SCA for shell
    expect(recs[0]).toContain('shellcheck');
  });
});

// ============================================================================
// identifyGaps
// ============================================================================

describe('identifyGaps', () => {
  const fullEntries = [
    '.github',
    'SECURITY.md',
    'CODEOWNERS',
    'LICENSE',
    '.semgrep.yml',
    'tests',
    '.gitignore',
    'package.json',
  ];

  it('returns no gaps for a fully-equipped repo', () => {
    expect(identifyGaps(fullEntries, 'github-actions')).toEqual([]);
  });

  it('flags missing CI', () => {
    const gaps = identifyGaps(fullEntries, null);
    expect(gaps).toContain('No CI/CD configuration detected');
  });

  it('flags missing SECURITY.md', () => {
    const entries = fullEntries.filter((e) => e !== 'SECURITY.md');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).toContain('No SECURITY.md policy');
  });

  it('flags missing CODEOWNERS', () => {
    const entries = fullEntries.filter((e) => e !== 'CODEOWNERS');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).toContain('No CODEOWNERS file');
  });

  it('flags missing LICENSE', () => {
    const entries = fullEntries.filter((e) => e !== 'LICENSE');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).toContain('No LICENSE file');
  });

  it('accepts LICENSE.md as alternative', () => {
    const entries = fullEntries.map((e) => (e === 'LICENSE' ? 'LICENSE.md' : e));
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).not.toContain('No LICENSE file');
  });

  it('flags missing SAST/SCA scanning', () => {
    const entries = fullEntries.filter((e) => e !== '.semgrep.yml');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).toContain('No SAST/SCA security scanning configured');
  });

  it('.grype.yaml satisfies SAST/SCA check', () => {
    const entries = fullEntries.map((e) => (e === '.semgrep.yml' ? '.grype.yaml' : e));
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).not.toContain('No SAST/SCA security scanning configured');
  });

  it('flags missing tests — no test dir or config', () => {
    const entries = fullEntries.filter((e) => e !== 'tests');
    // Also remove package.json to prevent monorepo detection
    const noTests = entries.filter((e) => e !== 'package.json');
    const gaps = identifyGaps(noTests, 'github-actions');
    expect(gaps).toContain('No test directory detected');
  });

  it('vitest.config.ts satisfies test detection', () => {
    const entries = fullEntries.filter((e) => e !== 'tests');
    entries.push('vitest.config.ts');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).not.toContain('No test directory detected');
  });

  it('monorepo pattern satisfies test detection', () => {
    const entries = fullEntries.filter((e) => e !== 'tests');
    entries.push('packages');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).not.toContain('No test directory detected');
  });

  it('flags missing .gitignore', () => {
    const entries = fullEntries.filter((e) => e !== '.gitignore');
    const gaps = identifyGaps(entries, 'github-actions');
    expect(gaps).toContain('No .gitignore file');
  });

  it('appends language-specific recommendations when SAST/SCA gap exists', () => {
    const entries = fullEntries.filter((e) => e !== '.semgrep.yml');
    const gaps = identifyGaps(entries, 'github-actions', 'TypeScript', []);
    expect(gaps).toContain('No SAST/SCA security scanning configured');
    expect(gaps.some((g) => g.includes('TypeScript project missing SAST'))).toBe(true);
  });

  it('skips language recs when no generic SAST gap', () => {
    const gaps = identifyGaps(fullEntries, 'github-actions', 'TypeScript', []);
    expect(gaps.some((g) => g.includes('TypeScript'))).toBe(false);
  });
});

// ============================================================================
// analyzeRepo (integration of all helpers)
// ============================================================================

describe('analyzeRepo', () => {
  const baseMetadata: GhRepoMetadata = {
    name: 'repo',
    full_name: 'owner/repo',
    description: 'A sample project',
    language: 'TypeScript',
    default_branch: 'main',
    stargazers_count: 42,
    license: { spdx_id: 'MIT' },
  };

  const fullEntries = [
    '.github',
    'SECURITY.md',
    'CODEOWNERS',
    'LICENSE',
    '.semgrep.yml',
    'tests',
    '.gitignore',
    'package.json',
    'tsconfig.json',
    'pnpm-lock.yaml',
    'Dockerfile',
    'Makefile',
  ];

  it('produces complete analysis for well-equipped repo', () => {
    const result = analyzeRepo(baseMetadata, fullEntries);
    expect(result.name).toBe('owner/repo');
    expect(result.language).toBe('TypeScript');
    expect(result.framework).toBe('typescript');
    expect(result.packageManager).toBe('pnpm');
    expect(result.ciProvider).toBe('github-actions');
    expect(result.hasDockerfile).toBe(true);
    expect(result.hasMakefile).toBe(true);
    expect(result.hasTests).toBe(true);
    expect(result.license).toBe('MIT');
    expect(result.description).toBe('A sample project');
    expect(result.defaultBranch).toBe('main');
    expect(result.stars).toBe(42);
    expect(result.gaps).toEqual([]);
  });

  it('handles null license', () => {
    const meta = { ...baseMetadata, license: null };
    const result = analyzeRepo(meta, fullEntries);
    expect(result.license).toBeNull();
  });

  it('returns readonly copy of entries', () => {
    const entries = ['src', 'README.md'];
    const result = analyzeRepo(baseMetadata, entries);
    expect(result.topLevelEntries).toEqual(entries);
  });

  it('detects docker-compose variants', () => {
    const r1 = analyzeRepo(baseMetadata, ['docker-compose.yml']);
    expect(r1.hasDockerfile).toBe(true);

    const r2 = analyzeRepo(baseMetadata, ['docker-compose.yaml']);
    expect(r2.hasDockerfile).toBe(true);
  });

  it('detects Helm charts via Chart.yaml', () => {
    const result = analyzeRepo(baseMetadata, ['Chart.yaml']);
    expect(result.hasHelmCharts).toBe(true);
  });

  it('detects Helm charts via charts directory', () => {
    const result = analyzeRepo(baseMetadata, ['charts']);
    expect(result.hasHelmCharts).toBe(true);
  });

  it('detects Helm charts via helm directory', () => {
    const result = analyzeRepo(baseMetadata, ['helm']);
    expect(result.hasHelmCharts).toBe(true);
  });
});
