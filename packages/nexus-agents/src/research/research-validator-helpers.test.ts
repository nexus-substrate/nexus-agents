/**
 * Tests for Research Validator Helpers
 * @module research/research-validator-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type {
  ResearchPaper,
  ResearchTechnique,
  PapersRegistry,
  TechniquesRegistry,
} from './research-schemas.js';
import type { ValidatorOptions } from './research-validator-types.js';
import {
  createIssue,
  validatePaper,
  validatePapers,
  validateSourcePapers,
  validateDependencies,
  validateIntegrationFiles,
  validateImplementationStatus,
  validateHighPriorityIssue,
  validateTechnique,
  validateTechniques,
  validateCrossReferences,
} from './research-validator-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makePaper(overrides: Partial<ResearchPaper> = {}): ResearchPaper {
  return {
    title: 'Test Paper',
    authors: ['Author A'],
    topics: ['consensus'],
    tags: [],
    techniques_extracted: [],
    key_findings: [],
    related_issues: [],
    implementation_status: 'not-started',
    rigor_tags: [],
    ...overrides,
  };
}

function makeTechnique(overrides: Partial<ResearchTechnique> = {}): ResearchTechnique {
  return {
    name: 'Test Technique',
    description: 'A test technique',
    source_papers: [],
    topic: 'consensus',
    tags: [],
    metrics: {},
    status: 'planned',
    priority: null,
    integration_files: [],
    implementation_issue: null,
    related_prs: [],
    dependencies: [],
    decision_history: [],
    ...overrides,
  };
}

// ============================================================================
// createIssue
// ============================================================================

describe('createIssue', () => {
  it('creates issue with all fields', () => {
    const issue = createIssue({
      severity: 'error',
      code: 'TEST_CODE',
      message: 'Test message',
      file: 'test.yaml',
      issuePath: 'path.to.field',
      suggestion: 'Fix it',
    });
    expect(issue.severity).toBe('error');
    expect(issue.code).toBe('TEST_CODE');
    expect(issue.message).toBe('Test message');
    expect(issue.file).toBe('test.yaml');
    expect(issue.path).toBe('path.to.field');
    expect(issue.suggestion).toBe('Fix it');
  });

  it('creates issue without optional fields', () => {
    const issue = createIssue({
      severity: 'warning',
      code: 'WARN_CODE',
      message: 'Warning',
      file: 'file.yaml',
    });
    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('WARN_CODE');
    expect('path' in issue).toBe(false);
    expect('suggestion' in issue).toBe(false);
  });

  it('creates issue with only path', () => {
    const issue = createIssue({
      severity: 'info',
      code: 'INFO_CODE',
      message: 'Info',
      file: 'file.yaml',
      issuePath: 'some.path',
    });
    expect(issue.path).toBe('some.path');
    expect('suggestion' in issue).toBe(false);
  });

  it('creates issue with only suggestion', () => {
    const issue = createIssue({
      severity: 'info',
      code: 'INFO_CODE',
      message: 'Info',
      file: 'file.yaml',
      suggestion: 'Do something',
    });
    expect('path' in issue).toBe(false);
    expect(issue.suggestion).toBe('Do something');
  });
});

// ============================================================================
// validatePaper
// ============================================================================

describe('validatePaper', () => {
  it('returns no issues for valid paper', () => {
    const paper = makePaper({ topics: ['consensus'], techniques_extracted: ['tech-1'] });
    const techniqueIds = new Set(['tech-1']);
    const issues = validatePaper('paper-1', paper, techniqueIds);
    expect(issues).toHaveLength(0);
  });

  it('warns when paper has no topics', () => {
    const paper = makePaper({ topics: [] });
    const issues = validatePaper('paper-1', paper, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('PAPER_NO_TOPICS');
    expect(issues[0]?.severity).toBe('warning');
  });

  it('errors on orphaned technique reference', () => {
    const paper = makePaper({ techniques_extracted: ['nonexistent'] });
    const issues = validatePaper('paper-1', paper, new Set(['other']));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('ORPHANED_TECHNIQUE_REF');
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('nonexistent');
  });

  it('warns on invalid arXiv ID format', () => {
    const paper = makePaper({ arxiv_id: 'bad-format', topics: ['consensus'] });
    const issues = validatePaper('paper-1', paper, new Set());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('INVALID_ARXIV_FORMAT');
  });

  it('accepts valid arXiv ID format', () => {
    const paper = makePaper({ arxiv_id: '2501.06322', topics: ['consensus'] });
    const issues = validatePaper('paper-1', paper, new Set());
    expect(issues).toHaveLength(0);
  });

  it('accepts arXiv ID with version suffix', () => {
    const paper = makePaper({ arxiv_id: '2501.06322v2', topics: ['consensus'] });
    const issues = validatePaper('paper-1', paper, new Set());
    expect(issues).toHaveLength(0);
  });

  it('returns multiple issues for paper with several problems', () => {
    const paper = makePaper({
      topics: [],
      techniques_extracted: ['missing-1', 'missing-2'],
      arxiv_id: 'invalid',
    });
    const issues = validatePaper('paper-1', paper, new Set());
    // 1 no-topics + 2 orphaned refs + 1 invalid arxiv = 4
    expect(issues).toHaveLength(4);
  });
});

// ============================================================================
// validatePapers
// ============================================================================

describe('validatePapers', () => {
  it('validates all papers in registry', () => {
    const registry: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ topics: [] }),
        'paper-2': makePaper({ topics: ['consensus'] }),
      },
    };
    const issues = validatePapers(registry, new Set());
    // Only paper-1 has an issue (no topics)
    expect(issues).toHaveLength(1);
  });

  it('returns empty for valid registry', () => {
    const registry: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ topics: ['consensus'] }),
      },
    };
    const issues = validatePapers(registry, new Set());
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateSourcePapers
// ============================================================================

describe('validateSourcePapers', () => {
  it('returns no issues when all references exist', () => {
    const issues = validateSourcePapers(
      'tech-1',
      ['paper-1', 'paper-2'],
      new Set(['paper-1', 'paper-2'])
    );
    expect(issues).toHaveLength(0);
  });

  it('errors on orphaned paper reference', () => {
    const issues = validateSourcePapers('tech-1', ['missing'], new Set(['paper-1']));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('ORPHANED_PAPER_REF');
    expect(issues[0]?.message).toContain('missing');
  });

  it('returns empty for no source papers', () => {
    const issues = validateSourcePapers('tech-1', [], new Set());
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateDependencies
// ============================================================================

describe('validateDependencies', () => {
  it('returns no issues when all dependencies exist', () => {
    const issues = validateDependencies('tech-1', ['tech-2'], new Set(['tech-1', 'tech-2']));
    expect(issues).toHaveLength(0);
  });

  it('errors on orphaned dependency', () => {
    const issues = validateDependencies('tech-1', ['missing'], new Set(['tech-1']));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('ORPHANED_DEPENDENCY_REF');
    expect(issues[0]?.message).toContain('missing');
  });

  it('returns empty for no dependencies', () => {
    const issues = validateDependencies('tech-1', [], new Set());
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateIntegrationFiles
// ============================================================================

describe('validateIntegrationFiles', () => {
  it('reports missing files as errors for required files', () => {
    const issues = validateIntegrationFiles({
      techniqueId: 'tech-1',
      integrationFiles: ['src/nonexistent.ts'],
      projectRoot: '/tmp/fake-project',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('MISSING_INTEGRATION_FILE');
    expect(issues[0]?.severity).toBe('error');
  });

  it('reports missing files as warnings for optional files', () => {
    const issues = validateIntegrationFiles({
      techniqueId: 'tech-1',
      integrationFiles: [{ path: 'src/optional.ts', type: 'helpers', required: false }],
      projectRoot: '/tmp/fake-project',
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('returns empty for no integration files', () => {
    const issues = validateIntegrationFiles({
      techniqueId: 'tech-1',
      integrationFiles: [],
      projectRoot: '/tmp',
    });
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateImplementationStatus
// ============================================================================

describe('validateImplementationStatus', () => {
  it('warns when implemented technique has no files', () => {
    const technique = makeTechnique({ status: 'implemented', integration_files: [] });
    const issues = validateImplementationStatus('tech-1', technique);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('IMPLEMENTED_NO_FILES');
  });

  it('no issue when implemented technique has files', () => {
    const technique = makeTechnique({
      status: 'implemented',
      integration_files: ['src/impl.ts'],
    });
    const issues = validateImplementationStatus('tech-1', technique);
    expect(issues).toHaveLength(0);
  });

  it('no issue for planned technique with no files', () => {
    const technique = makeTechnique({ status: 'planned', integration_files: [] });
    const issues = validateImplementationStatus('tech-1', technique);
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateHighPriorityIssue
// ============================================================================

describe('validateHighPriorityIssue', () => {
  it('flags P1 technique without implementation issue', () => {
    const technique = makeTechnique({
      priority: 'P1',
      status: 'planned',
      implementation_issue: null,
    });
    const issues = validateHighPriorityIssue('tech-1', technique);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('HIGH_PRIORITY_NO_ISSUE');
  });

  it('flags P2 technique without implementation issue', () => {
    const technique = makeTechnique({
      priority: 'P2',
      status: 'not-started',
      implementation_issue: null,
    });
    const issues = validateHighPriorityIssue('tech-1', technique);
    expect(issues).toHaveLength(1);
  });

  it('no issue for P1 with implementation issue', () => {
    const technique = makeTechnique({
      priority: 'P1',
      status: 'planned',
      implementation_issue: 123,
    });
    const issues = validateHighPriorityIssue('tech-1', technique);
    expect(issues).toHaveLength(0);
  });

  it('no issue for P3/P4 without implementation issue', () => {
    const issuesP3 = validateHighPriorityIssue(
      't1',
      makeTechnique({ priority: 'P3', status: 'planned' })
    );
    const issuesP4 = validateHighPriorityIssue(
      't2',
      makeTechnique({ priority: 'P4', status: 'planned' })
    );
    expect(issuesP3).toHaveLength(0);
    expect(issuesP4).toHaveLength(0);
  });

  it('no issue for implemented technique even at P1', () => {
    const technique = makeTechnique({
      priority: 'P1',
      status: 'implemented',
      implementation_issue: null,
    });
    const issues = validateHighPriorityIssue('tech-1', technique);
    expect(issues).toHaveLength(0);
  });

  it('no issue for rejected technique even at P1', () => {
    const technique = makeTechnique({
      priority: 'P1',
      status: 'rejected',
      implementation_issue: null,
    });
    const issues = validateHighPriorityIssue('tech-1', technique);
    expect(issues).toHaveLength(0);
  });
});

// ============================================================================
// validateTechnique
// ============================================================================

describe('validateTechnique', () => {
  const defaultOptions: ValidatorOptions = {
    projectRoot: '/tmp',
    checkFileExistence: false,
    strict: false,
  };

  it('validates technique with no issues', () => {
    const technique = makeTechnique({ source_papers: ['paper-1'] });
    const issues = validateTechnique({
      techniqueId: 'tech-1',
      technique,
      paperIds: new Set(['paper-1']),
      techniqueIds: new Set(['tech-1']),
      options: defaultOptions,
    });
    expect(issues).toHaveLength(0);
  });

  it('aggregates issues from all validators', () => {
    const technique = makeTechnique({
      source_papers: ['missing-paper'],
      dependencies: ['missing-dep'],
      status: 'implemented',
      integration_files: [],
      priority: 'P1',
      implementation_issue: null,
    });
    const issues = validateTechnique({
      techniqueId: 'tech-1',
      technique,
      paperIds: new Set(),
      techniqueIds: new Set(['tech-1']),
      options: defaultOptions,
    });
    // orphaned paper + orphaned dep + implemented-no-files
    // P1 with implemented status does NOT trigger high-priority-no-issue
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it('skips file existence check when disabled', () => {
    const technique = makeTechnique({
      status: 'implemented',
      integration_files: ['src/missing.ts'],
    });
    const issues = validateTechnique({
      techniqueId: 'tech-1',
      technique,
      paperIds: new Set(),
      techniqueIds: new Set(['tech-1']),
      options: { ...defaultOptions, checkFileExistence: false },
    });
    // No MISSING_INTEGRATION_FILE because checkFileExistence is false
    const missingFileIssues = issues.filter((i) => i.code === 'MISSING_INTEGRATION_FILE');
    expect(missingFileIssues).toHaveLength(0);
  });
});

// ============================================================================
// validateTechniques
// ============================================================================

describe('validateTechniques', () => {
  const defaultOptions: ValidatorOptions = {
    projectRoot: '/tmp',
    checkFileExistence: false,
    strict: false,
  };

  it('validates all techniques in registry', () => {
    const registry: TechniquesRegistry = {
      schema_version: '1.1',
      techniques: {
        'tech-1': makeTechnique({ source_papers: ['missing'] }),
        'tech-2': makeTechnique(),
      },
    };
    const issues = validateTechniques(registry, new Set(), defaultOptions);
    // Only tech-1 has orphaned paper ref
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('ORPHANED_PAPER_REF');
  });
});

// ============================================================================
// validateCrossReferences
// ============================================================================

describe('validateCrossReferences', () => {
  it('returns no issues when cross-references are consistent', () => {
    const papers: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ techniques_extracted: ['tech-1'] }),
      },
    };
    const techniques: TechniquesRegistry = {
      schema_version: '1.1',
      techniques: {
        'tech-1': makeTechnique({ source_papers: ['paper-1'] }),
      },
    };
    const issues = validateCrossReferences(papers, techniques);
    expect(issues).toHaveLength(0);
  });

  it('warns when technique claims paper but paper does not list it', () => {
    const papers: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ techniques_extracted: [] }),
      },
    };
    const techniques: TechniquesRegistry = {
      schema_version: '1.1',
      techniques: {
        'tech-1': makeTechnique({ source_papers: ['paper-1'] }),
      },
    };
    const issues = validateCrossReferences(papers, techniques);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('TECHNIQUE_NOT_IN_PAPER');
    expect(issues[0]?.message).toContain('tech-1');
    expect(issues[0]?.message).toContain('paper-1');
  });

  it('no issue when paper lists technique but technique does not claim paper', () => {
    // This direction is validated by validatePaper (ORPHANED_TECHNIQUE_REF), not cross-refs
    const papers: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ techniques_extracted: ['tech-1'] }),
      },
    };
    const techniques: TechniquesRegistry = {
      schema_version: '1.1',
      techniques: {
        'tech-1': makeTechnique({ source_papers: [] }),
      },
    };
    const issues = validateCrossReferences(papers, techniques);
    expect(issues).toHaveLength(0);
  });

  it('handles empty registries', () => {
    const papers: PapersRegistry = { schema_version: '1.1', papers: {} };
    const techniques: TechniquesRegistry = { schema_version: '1.1', techniques: {} };
    const issues = validateCrossReferences(papers, techniques);
    expect(issues).toHaveLength(0);
  });

  it('handles multiple techniques claiming same paper', () => {
    const papers: PapersRegistry = {
      schema_version: '1.1',
      papers: {
        'paper-1': makePaper({ techniques_extracted: ['tech-1'] }),
      },
    };
    const techniques: TechniquesRegistry = {
      schema_version: '1.1',
      techniques: {
        'tech-1': makeTechnique({ source_papers: ['paper-1'] }),
        'tech-2': makeTechnique({ source_papers: ['paper-1'] }),
      },
    };
    const issues = validateCrossReferences(papers, techniques);
    // tech-2 claims paper-1 but paper-1 only lists tech-1
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('tech-2');
  });
});
