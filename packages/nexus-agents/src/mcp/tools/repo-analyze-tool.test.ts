/**
 * Tests for repo_analyze MCP Tool
 *
 * Tests the pure analysis logic (no network calls).
 * GitHub API integration tested separately via MCP integration tests.
 *
 * @module mcp/tools/repo-analyze-tool.test
 * (Source: Issue #1074)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  normalizeRepoId,
  detectPackageManager,
  detectCiProvider,
  detectSecurityTooling,
  detectFramework,
  identifyGaps,
  getLanguageRecommendations,
  analyzeRepo,
} from './repo-analyze.js';
import type { GhRepoMetadata } from './repo-analyze.js';
import { RepoAnalyzeInputSchema } from './repo-analyze-types.js';
import { registerRepoAnalyzeTool } from './repo-analyze-tool.js';

// ============================================================================
// normalizeRepoId
// ============================================================================

describe('normalizeRepoId', () => {
  it('accepts owner/name format', () => {
    expect(normalizeRepoId('cloudfoundry/korifi')).toBe('cloudfoundry/korifi');
  });

  it('extracts from full GitHub URL', () => {
    expect(normalizeRepoId('https://github.com/owner/repo')).toBe('owner/repo');
  });

  it('extracts from URL with .git suffix', () => {
    expect(normalizeRepoId('https://github.com/owner/repo.git')).toBe('owner/repo');
  });

  it('extracts from URL with trailing slash', () => {
    expect(normalizeRepoId('https://github.com/owner/repo/')).toBe('owner/repo');
  });

  it('throws on invalid format', () => {
    expect(() => normalizeRepoId('just-a-name')).toThrow('Invalid repo format');
  });

  it('throws on empty string after schema validation', () => {
    expect(() => normalizeRepoId('')).toThrow('Invalid repo format');
  });
});

// ============================================================================
// detectPackageManager
// ============================================================================

describe('detectPackageManager', () => {
  it('detects npm from package.json', () => {
    expect(detectPackageManager(['package.json', 'README.md'])).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    expect(detectPackageManager(['pnpm-lock.yaml', 'package.json'])).toBe('pnpm');
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

  it('detects maven from pom.xml', () => {
    expect(detectPackageManager(['pom.xml', 'src'])).toBe('maven');
  });

  it('returns null when no package manager detected', () => {
    expect(detectPackageManager(['README.md'])).toBeNull();
  });
});

// ============================================================================
// detectCiProvider
// ============================================================================

describe('detectCiProvider', () => {
  it('detects github-actions from .github', () => {
    expect(detectCiProvider(['.github', 'src'])).toBe('github-actions');
  });

  it('detects gitlab-ci', () => {
    expect(detectCiProvider(['.gitlab-ci.yml'])).toBe('gitlab-ci');
  });

  it('detects jenkins from Jenkinsfile', () => {
    expect(detectCiProvider(['Jenkinsfile'])).toBe('jenkins');
  });

  it('detects concourse', () => {
    expect(detectCiProvider(['concourse', 'src'])).toBe('concourse');
  });

  it('returns null when no CI detected', () => {
    expect(detectCiProvider(['src', 'README.md'])).toBeNull();
  });
});

// ============================================================================
// detectSecurityTooling
// ============================================================================

describe('detectSecurityTooling', () => {
  it('detects semgrep', () => {
    expect(detectSecurityTooling(['.semgrep.yml'])).toContain('semgrep');
  });

  it('detects security policy', () => {
    expect(detectSecurityTooling(['SECURITY.md'])).toContain('security-policy');
  });

  it('detects codeowners', () => {
    expect(detectSecurityTooling(['CODEOWNERS'])).toContain('codeowners');
  });

  it('returns empty array when nothing detected', () => {
    expect(detectSecurityTooling(['README.md'])).toEqual([]);
  });

  it('detects multiple tools', () => {
    const result = detectSecurityTooling(['.semgrep.yml', 'SECURITY.md', 'CODEOWNERS']);
    expect(result).toHaveLength(3);
  });
});

// ============================================================================
// detectFramework
// ============================================================================

describe('detectFramework', () => {
  it('detects helmfile', () => {
    expect(detectFramework(['helmfile.yaml.gotmpl'])).toBe('helmfile');
  });

  it('detects nextjs', () => {
    expect(detectFramework(['next.config.js', 'package.json'])).toBe('nextjs');
  });

  it('detects typescript project', () => {
    expect(detectFramework(['tsconfig.json', 'package.json'])).toBe('typescript');
  });

  it('returns null when nothing detected', () => {
    expect(detectFramework(['README.md'])).toBeNull();
  });
});

// ============================================================================
// identifyGaps
// ============================================================================

describe('identifyGaps', () => {
  it('identifies missing CI', () => {
    const gaps = identifyGaps(['README.md'], null);
    expect(gaps).toContain('No CI/CD configuration detected');
  });

  it('identifies missing SECURITY.md', () => {
    const gaps = identifyGaps(['README.md'], 'github-actions');
    expect(gaps).toContain('No SECURITY.md policy');
  });

  it('identifies missing tests', () => {
    const gaps = identifyGaps(['src', 'README.md'], 'github-actions');
    expect(gaps).toContain('No test directory detected');
  });

  it('does not flag tests when test dir exists', () => {
    const gaps = identifyGaps(
      ['src', 'tests', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', '.gitignore'],
      'github-actions'
    );
    expect(gaps).not.toContain('No test directory detected');
  });

  it('returns empty array for well-configured repo', () => {
    const gaps = identifyGaps(
      ['.github', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', '.semgrep.yml', 'tests', '.gitignore'],
      'github-actions'
    );
    expect(gaps).toHaveLength(0);
  });

  it('adds language-specific SAST recommendations for Python', () => {
    const gaps = identifyGaps(
      ['src', 'README.md', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', 'tests', '.gitignore'],
      'github-actions',
      'Python',
      []
    );
    expect(gaps).toContain('No SAST/SCA security scanning configured');
    const sastGap = gaps.find((g) => g.includes('Python') && g.includes('SAST'));
    expect(sastGap).toContain('bandit');
    expect(sastGap).toContain('semgrep');
  });

  it('adds language-specific SCA recommendations for Java', () => {
    const gaps = identifyGaps(
      ['src', 'README.md', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', 'tests', '.gitignore'],
      'github-actions',
      'Java',
      []
    );
    const scaGap = gaps.find((g) => g.includes('Java') && g.includes('SCA'));
    expect(scaGap).toContain('OWASP dependency-check');
  });

  it('skips language recommendations when SAST/SCA already present', () => {
    const gaps = identifyGaps(
      ['.github', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', '.semgrep.yml', 'tests', '.gitignore'],
      'github-actions',
      'Python',
      ['semgrep']
    );
    expect(gaps.some((g) => g.includes('Python'))).toBe(false);
  });

  it('handles unknown language gracefully', () => {
    const gaps = identifyGaps(
      ['src', 'README.md', 'SECURITY.md', 'CODEOWNERS', 'LICENSE', 'tests', '.gitignore'],
      'github-actions',
      'Fortran',
      []
    );
    expect(gaps.some((g) => g.includes('Fortran'))).toBe(false);
  });
});

// ============================================================================
// getLanguageRecommendations
// ============================================================================

describe('getLanguageRecommendations', () => {
  it('returns SAST+SCA recommendations for Python with no tools', () => {
    const recs = getLanguageRecommendations('Python', []);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toContain('SAST');
    expect(recs[0]).toContain('bandit');
    expect(recs[1]).toContain('SCA');
    expect(recs[1]).toContain('pip-audit');
  });

  it('skips SAST when semgrep is present', () => {
    const recs = getLanguageRecommendations('Python', ['semgrep']);
    expect(recs.some((r) => r.includes('SAST'))).toBe(false);
    expect(recs.some((r) => r.includes('SCA'))).toBe(true);
  });

  it('skips SCA when trivy is present', () => {
    const recs = getLanguageRecommendations('Go', ['trivy']);
    expect(recs.some((r) => r.includes('SCA'))).toBe(false);
    expect(recs.some((r) => r.includes('SAST'))).toBe(true);
  });

  it('returns empty for null language', () => {
    expect(getLanguageRecommendations(null, [])).toEqual([]);
  });

  it('returns empty for unknown language', () => {
    expect(getLanguageRecommendations('COBOL', [])).toEqual([]);
  });

  it('recommends shellcheck for Shell', () => {
    const recs = getLanguageRecommendations('Shell', []);
    expect(recs[0]).toContain('shellcheck');
  });

  it('recommends brakeman for Ruby', () => {
    const recs = getLanguageRecommendations('Ruby', []);
    expect(recs[0]).toContain('brakeman');
  });

  it('skips SCA for Shell (no SCA tools)', () => {
    const recs = getLanguageRecommendations('Shell', []);
    expect(recs.some((r) => r.includes('SCA'))).toBe(false);
  });

  it('covers all 14 supported languages', () => {
    const langs = [
      'TypeScript',
      'JavaScript',
      'Python',
      'Java',
      'Go',
      'Rust',
      'C++',
      'C',
      'Kotlin',
      'Swift',
      'Ruby',
      'PHP',
      'Shell',
      'HCL',
    ];
    for (const lang of langs) {
      const recs = getLanguageRecommendations(lang, []);
      expect(recs.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// analyzeRepo (integration of all detectors)
// ============================================================================

describe('analyzeRepo', () => {
  const baseMetadata: GhRepoMetadata = {
    name: 'kind-deployment',
    full_name: 'cloudfoundry/kind-deployment',
    description: 'Deploy CF on KIND',
    language: 'Shell',
    default_branch: 'main',
    stargazers_count: 11,
    license: { spdx_id: 'Apache-2.0' },
  };

  it('produces complete analysis for a real-world repo structure', () => {
    const entries = [
      '.github',
      'Makefile',
      'README.md',
      'helmfile.yaml.gotmpl',
      'kind.yaml',
      'scripts',
      'releases',
      'docs',
      'examples',
      'docker-bake.hcl',
      'SECURITY.md',
      'CODEOWNERS',
      'LICENSE',
    ];

    const result = analyzeRepo(baseMetadata, entries);

    expect(result.name).toBe('cloudfoundry/kind-deployment');
    expect(result.language).toBe('Shell');
    expect(result.framework).toBe('helmfile');
    expect(result.ciProvider).toBe('github-actions');
    expect(result.hasMakefile).toBe(true);
    expect(result.license).toBe('Apache-2.0');
    expect(result.stars).toBe(11);
    expect(result.defaultBranch).toBe('main');
    expect(result.securityTooling).toContain('security-policy');
    expect(result.securityTooling).toContain('codeowners');
  });

  it('identifies gaps in a minimal repo', () => {
    const result = analyzeRepo({ ...baseMetadata, license: null }, ['src', 'README.md']);

    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.gaps).toContain('No CI/CD configuration detected');
    expect(result.gaps).toContain('No SECURITY.md policy');
    expect(result.gaps).toContain('No LICENSE file');
    expect(result.license).toBeNull();
  });

  it('includes language-specific SAST recs for Shell repo without scanning', () => {
    const result = analyzeRepo(baseMetadata, ['src', 'README.md', 'LICENSE', '.gitignore']);
    const shellGap = result.gaps.find((g) => g.includes('Shell') && g.includes('SAST'));
    expect(shellGap).toContain('shellcheck');
  });

  it('detects Docker and Helm support', () => {
    const result = analyzeRepo(baseMetadata, ['Dockerfile', 'Chart.yaml', 'README.md', 'LICENSE']);

    expect(result.hasDockerfile).toBe(true);
    expect(result.hasHelmCharts).toBe(true);
  });

  it('handles null description and license gracefully', () => {
    const result = analyzeRepo({ ...baseMetadata, description: null, license: null }, [
      'README.md',
      'LICENSE',
    ]);

    expect(result.description).toBeNull();
    expect(result.license).toBeNull();
  });
});

// ============================================================================
// Input Schema Validation
// ============================================================================

describe('RepoAnalyzeInputSchema', () => {
  it('accepts owner/name format', () => {
    const result = RepoAnalyzeInputSchema.safeParse({ repo: 'owner/repo' });
    expect(result.success).toBe(true);
  });

  it('accepts full URL', () => {
    const result = RepoAnalyzeInputSchema.safeParse({
      repo: 'https://github.com/owner/repo',
    });
    expect(result.success).toBe(true);
  });

  it('defaults depth to shallow', () => {
    const result = RepoAnalyzeInputSchema.parse({ repo: 'owner/repo' });
    expect(result.depth).toBe('shallow');
  });

  it('accepts deep depth', () => {
    const result = RepoAnalyzeInputSchema.parse({
      repo: 'owner/repo',
      depth: 'deep',
    });
    expect(result.depth).toBe('deep');
  });

  it('rejects empty repo string', () => {
    const result = RepoAnalyzeInputSchema.safeParse({ repo: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid depth', () => {
    const result = RepoAnalyzeInputSchema.safeParse({
      repo: 'owner/repo',
      depth: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Tool Registration
// ============================================================================

describe('registerRepoAnalyzeTool', () => {
  it('registers the tool with correct name', () => {
    const registerTool = vi.fn();
    const mockServer = { registerTool } as unknown as Parameters<typeof registerRepoAnalyzeTool>[0];

    const mockRateLimiter = {
      tryAcquire: vi.fn().mockReturnValue(true),
    } as unknown as Parameters<typeof registerRepoAnalyzeTool>[1]['rateLimiter'];

    registerRepoAnalyzeTool(mockServer, { rateLimiter: mockRateLimiter });

    expect(registerTool).toHaveBeenCalledOnce();
    const callArgs = registerTool.mock.calls[0] as unknown[];
    expect(callArgs[0]).toBe('repo_analyze');
  });
});
