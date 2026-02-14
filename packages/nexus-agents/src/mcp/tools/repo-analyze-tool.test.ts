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
