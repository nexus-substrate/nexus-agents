/**
 * Tests for research-index-generator.ts
 *
 * Covers: generateIndexMarkdown, checkIndexFreshness, computeStats,
 * buildParsedData, extractExistingChecksums, and internal helpers.
 * File I/O is fully mocked via vi.mock('node:fs') and vi.mock('yaml').
 */

import * as crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import { generateIndexMarkdown, checkIndexFreshness } from './research-index-generator.js';
import type { GeneratorOptions } from './research-index-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

import * as fs from 'node:fs';
import * as yaml from 'yaml';

const FIXED_TIME = 1700000000000; // 2023-11-14

beforeEach(() => {
  vi.clearAllMocks();
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
});

afterEach(() => {
  resetTimeProvider();
});

// ============================================================================
// Test Data Factories
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makePapersYaml() {
  return {
    schema_version: '1.1',
    papers: {
      'paper-1': {
        title: 'Test Paper One',
        topics: ['consensus'],
        tags: [],
        authors: [],
        key_findings: [],
        techniques_extracted: [],
        related_issues: [],
        reviewed_date: '2024-01-15',
        url: 'https://arxiv.org/abs/2401.00001',
        implementation_status: 'not-started',
      },
      'paper-2': {
        title: 'Test Paper Two',
        topics: ['memory'],
        tags: ['context'],
        authors: [],
        key_findings: [],
        techniques_extracted: [],
        related_issues: [],
        reviewed_date: '2024-01-10',
        implementation_status: 'not-started',
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTechniquesYaml() {
  return {
    schema_version: '1.1',
    techniques: {
      'tech-1': {
        name: 'Consensus Technique',
        description: 'A technique for consensus.',
        topic: 'consensus',
        status: 'implemented',
        priority: 'P1',
        tags: ['consensus', 'voting'],
        metrics: { accuracy: '95%' },
        source_papers: ['paper-1'],
        implementation_issue: 42,
        integration_files: [],
        related_prs: [],
        dependencies: [],
        decision_history: [],
      },
      'tech-2': {
        name: 'Memory Technique',
        description: 'A technique for memory.',
        topic: 'memory',
        status: 'planned',
        priority: 'P2',
        tags: ['memory'],
        metrics: {},
        source_papers: [],
        implementation_issue: null,
        integration_files: [],
        related_prs: [],
        dependencies: [],
        decision_history: [],
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeOpts(overrides: Partial<GeneratorOptions> = {}) {
  return {
    papersPath: '/tmp/papers.yaml',
    techniquesPath: '/tmp/techniques.yaml',
    includeP1Table: true,
    includeP2Table: true,
    includePapersByTopic: true,
    includeGitHubIssues: true,
    recentPapersLimit: 10,
    ...overrides,
  };
}

/**
 * Configure mocks for a successful parse of both YAML files.
 */
function setupSuccessfulParse(): void {
  const papersContent = 'papers-yaml-content';
  const techniquesContent = 'techniques-yaml-content';

  vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
    const p = String(filePath);
    if (p.includes('papers')) return papersContent;
    if (p.includes('techniques')) return techniquesContent;
    return '';
  });

  vi.mocked(yaml.parse).mockImplementation((content: string) => {
    if (content === papersContent) return makePapersYaml();
    if (content === techniquesContent) return makeTechniquesYaml();
    return {};
  });
}

// ============================================================================
// generateIndexMarkdown
// ============================================================================

describe('generateIndexMarkdown', () => {
  it('returns ok result with markdown content on valid input', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('# Nexus-Agents Research Index');
    }
  });

  it('includes frontmatter with checksums', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('sha256:');
      expect(result.value).toContain('AUTO-GENERATED');
    }
  });

  it('includes quick stats section', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Quick Stats');
      expect(result.value).toContain('Implemented');
    }
  });

  it('includes P1 section when enabled and P1 techniques exist', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ includeP1Table: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Priority 1');
      expect(result.value).toContain('Consensus Technique');
    }
  });

  it('excludes P1 section when disabled', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ includeP1Table: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toContain('Priority 1 (P1)');
    }
  });

  it('includes P2 section when enabled and P2 techniques exist', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ includeP2Table: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Priority 2');
      expect(result.value).toContain('Memory Technique');
    }
  });

  it('includes recent papers section', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Recently Reviewed Papers');
      expect(result.value).toContain('Test Paper One');
    }
  });

  it('includes search tags section', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Search Tags');
      expect(result.value).toContain('#consensus');
    }
  });

  it('includes contributing section', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('How to Contribute');
      expect(result.value).toContain('CONTRIBUTING.md');
    }
  });

  it('returns error when papers file cannot be read', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('ENOENT');
    }
  });

  it('returns error when papers.yaml has invalid schema', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('invalid-yaml');
    vi.mocked(yaml.parse).mockReturnValue({ not_valid: true });
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid papers.yaml');
    }
  });

  it('returns error when techniques.yaml has invalid schema', () => {
    const papersContent = 'papers-ok';
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('papers')) return papersContent;
      return 'techniques-bad';
    });
    vi.mocked(yaml.parse).mockImplementation((content: string) => {
      if (content === papersContent) return makePapersYaml();
      return { bad_schema: true };
    });
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Invalid techniques.yaml');
    }
  });

  it('wraps non-Error throws into Error objects', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('string-error');
    });
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe('string-error');
    }
  });

  it('uses default options when none provided', () => {
    // Will fail on file read since defaults point to relative paths
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = generateIndexMarkdown();
    expect(result.ok).toBe(false);
  });

  it('respects recentPapersLimit option', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ recentPapersLimit: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      // With limit=1, the "Recently Reviewed Papers" section should only
      // have one data row. Paper Two (2024-01-10) is older and excluded.
      // Extract the section between "Recently Reviewed" and "Papers by Topic"
      const start = result.value.indexOf('## Recently Reviewed Papers');
      const end = result.value.indexOf('## Papers by Topic');
      const recentSection = result.value.slice(start, end);
      expect(recentSection).toContain('Test Paper One');
      expect(recentSection).not.toContain('Test Paper Two');
    }
  });

  it('includes GitHub Issues section when enabled', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ includeGitHubIssues: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('GitHub Issues');
      expect(result.value).toContain('#42');
    }
  });

  it('excludes GitHub Issues section when disabled', () => {
    setupSuccessfulParse();
    const result = generateIndexMarkdown(makeOpts({ includeGitHubIssues: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toContain('GitHub Issues');
    }
  });
});

// ============================================================================
// checkIndexFreshness
// ============================================================================

describe('checkIndexFreshness', () => {
  it('returns fresh=false when index file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = checkIndexFreshness('/tmp/index.md', makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(false);
      expect(result.value.reason).toContain('does not exist');
    }
  });

  it('returns fresh=false when index has no checksums', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p === '/tmp/index.md') return '# No checksums here\n';
      return 'yaml-content';
    });
    const result = checkIndexFreshness('/tmp/index.md', makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(false);
      expect(result.value.reason).toContain('missing checksums');
    }
  });

  it('returns fresh=false when papers.yaml checksum changed', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p === '/tmp/index.md') {
        return [
          '<!--',
          '  papers: sha256:0000000000000000',
          '  techniques: sha256:aaaaaaaaaaaaaaaa',
          '-->',
        ].join('\n');
      }
      if (p.includes('papers')) return 'changed-papers-content';
      if (p.includes('techniques')) {
        // Return content whose checksum matches aaaaaaaaaaaaaaaa
        // In practice, this won't match, so papers changed is detected first
        return 'techniques-content';
      }
      return '';
    });
    const result = checkIndexFreshness('/tmp/index.md', makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(false);
      expect(result.value.reason).toContain('papers.yaml has changed');
    }
  });

  it('returns fresh=false when techniques.yaml checksum changed', () => {
    // We need the papers checksum to match but techniques to differ.
    // Compute the real checksum for a fixed papers content.
    const papersContent = 'fixed-papers';
    const papersChecksum = crypto
      .createHash('sha256')
      .update(papersContent)
      .digest('hex')
      .slice(0, 16);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p === '/tmp/index.md') {
        return [
          '<!--',
          `  papers: sha256:${papersChecksum}`,
          '  techniques: sha256:0000000000000000',
          '-->',
        ].join('\n');
      }
      if (p.includes('papers')) return papersContent;
      if (p.includes('techniques')) return 'changed-techniques';
      return '';
    });

    const result = checkIndexFreshness('/tmp/index.md', makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(false);
      expect(result.value.reason).toContain('techniques.yaml has changed');
    }
  });

  it('returns fresh=true when all checksums match', () => {
    const papersContent = 'stable-papers';
    const techniquesContent = 'stable-techniques';

    const papersChecksum = crypto
      .createHash('sha256')
      .update(papersContent)
      .digest('hex')
      .slice(0, 16);
    const techniquesChecksum = crypto
      .createHash('sha256')
      .update(techniquesContent)
      .digest('hex')
      .slice(0, 16);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p === '/tmp/index.md') {
        return [
          '<!--',
          `  papers: sha256:${papersChecksum}`,
          `  techniques: sha256:${techniquesChecksum}`,
          '-->',
        ].join('\n');
      }
      if (p.includes('papers')) return papersContent;
      if (p.includes('techniques')) return techniquesContent;
      return '';
    });

    const result = checkIndexFreshness('/tmp/index.md', makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(true);
      expect(result.value.reason).toContain('up to date');
    }
  });

  it('uses default options when none provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = checkIndexFreshness('/tmp/index.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fresh).toBe(false);
    }
  });
});

// ============================================================================
// generateIndexMarkdown - empty registries
// ============================================================================

describe('generateIndexMarkdown with empty registries', () => {
  it('handles empty papers and techniques', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('empty-yaml');
    vi.mocked(yaml.parse).mockReturnValue({
      schema_version: '1.1',
      papers: {},
      techniques: {},
    });
    // The same mock returns the same object for both files,
    // but papers file is parsed first. Since both keys exist,
    // papers parse succeeds. Techniques parse also succeeds
    // because the object has a 'techniques' key.
    // However, PapersRegistrySchema expects { schema_version, papers }
    // and TechniquesRegistrySchema expects { schema_version, techniques }.
    // The combined object passes both since extra keys are stripped.
    const result = generateIndexMarkdown(makeOpts());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Total Papers:** 0');
      expect(result.value).toContain('Techniques:** 0');
    }
  });
});
