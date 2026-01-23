/**
 * nexus-agents/research - Validator Tests
 *
 * Tests for research registry validation.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import { describe, it, expect } from 'vitest';
import {
  validateRegistry,
  formatValidationResult,
  formatValidationResultJson,
} from './research-validator.js';
import type { ParsedRegistry } from './research-validator.js';
import type { PapersRegistry, TechniquesRegistry } from './research-schemas.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createValidRegistry(): ParsedRegistry {
  const papers: PapersRegistry = {
    schema_version: '1.1',
    papers: {
      'arxiv-2501.06322': {
        title: 'Multi-Agent Survey',
        topics: ['consensus'],
        tags: ['multi-agent'],
        techniques_extracted: ['aegean-consensus'],
        authors: [],
        key_findings: [],
        related_issues: [],
        implementation_status: 'not-started',
      },
    },
  };

  const techniques: TechniquesRegistry = {
    schema_version: '1.1',
    techniques: {
      'aegean-consensus': {
        name: 'Aegean Consensus',
        description: 'Formal consensus protocol',
        source_papers: ['arxiv-2501.06322'],
        topic: 'consensus',
        status: 'implemented',
        tags: ['consensus'],
        metrics: {},
        integration_files: [],
        related_prs: [],
        dependencies: [],
        decision_history: [],
        implementation_issue: 119,
        priority: 'P1',
      },
    },
  };

  return { papers, techniques };
}

// ============================================================================
// Valid Registry Tests
// ============================================================================

describe('validateRegistry', () => {
  it('should pass for valid registry', () => {
    const registry = createValidRegistry();
    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.stats.errors).toBe(0);
    }
  });

  it('should detect orphaned technique reference in paper', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.techniques_extracted = ['non-existent-technique'];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.stats.errors).toBeGreaterThan(0);

      const orphanedIssue = result.value.issues.find((i) => i.code === 'ORPHANED_TECHNIQUE_REF');
      expect(orphanedIssue).toBeDefined();
    }
  });

  it('should detect orphaned paper reference in technique', () => {
    const registry = createValidRegistry();
    registry.techniques.techniques['aegean-consensus']!.source_papers = ['non-existent-paper'];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      const orphanedIssue = result.value.issues.find((i) => i.code === 'ORPHANED_PAPER_REF');
      expect(orphanedIssue).toBeDefined();
    }
  });

  it('should detect orphaned dependency reference', () => {
    const registry = createValidRegistry();
    registry.techniques.techniques['aegean-consensus']!.dependencies = ['non-existent-dep'];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      const orphanedIssue = result.value.issues.find((i) => i.code === 'ORPHANED_DEPENDENCY_REF');
      expect(orphanedIssue).toBeDefined();
    }
  });

  it('should warn about paper with no topics', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.topics = [];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // No topics is a warning, not an error
      expect(result.value.stats.warnings).toBeGreaterThan(0);
      const noTopicsIssue = result.value.issues.find((i) => i.code === 'PAPER_NO_TOPICS');
      expect(noTopicsIssue).toBeDefined();
    }
  });

  it('should warn about implemented technique without files', () => {
    const registry = createValidRegistry();
    registry.techniques.techniques['aegean-consensus']!.integration_files = [];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const noFilesIssue = result.value.issues.find((i) => i.code === 'IMPLEMENTED_NO_FILES');
      expect(noFilesIssue).toBeDefined();
    }
  });

  it('should info about high priority technique without issue', () => {
    const registry = createValidRegistry();
    registry.techniques.techniques['aegean-consensus']!.implementation_issue = null;
    registry.techniques.techniques['aegean-consensus']!.status = 'planned';

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const noIssueInfo = result.value.issues.find((i) => i.code === 'HIGH_PRIORITY_NO_ISSUE');
      expect(noIssueInfo).toBeDefined();
    }
  });

  it('should detect cross-reference mismatch', () => {
    const registry = createValidRegistry();
    // Technique claims paper but paper doesn't list the technique
    registry.papers.papers['arxiv-2501.06322']!.techniques_extracted = [];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const mismatchIssue = result.value.issues.find((i) => i.code === 'TECHNIQUE_NOT_IN_PAPER');
      expect(mismatchIssue).toBeDefined();
    }
  });
});

// ============================================================================
// Strict Mode Tests
// ============================================================================

describe('validateRegistry strict mode', () => {
  it('should fail on warnings in strict mode', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.topics = [];

    const result = validateRegistry(registry, {
      checkFileExistence: false,
      strict: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Has warnings, so should be invalid in strict mode
      expect(result.value.valid).toBe(false);
    }
  });

  it('should pass without warnings in strict mode', () => {
    const registry = createValidRegistry();
    // Add integration files to avoid warning
    registry.techniques.techniques['aegean-consensus']!.integration_files = ['src/consensus.ts'];

    const result = validateRegistry(registry, {
      checkFileExistence: false,
      strict: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only cross-reference warning remains
      const hasErrors = result.value.stats.errors > 0;
      expect(hasErrors).toBe(false);
      // May have info-level issues or warnings
    }
  });
});

// ============================================================================
// ArXiv Validation Tests
// ============================================================================

describe('validateRegistry arXiv validation', () => {
  it('should warn about invalid arXiv format', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.arxiv_id = 'invalid-format';

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const formatIssue = result.value.issues.find((i) => i.code === 'INVALID_ARXIV_FORMAT');
      expect(formatIssue).toBeDefined();
    }
  });

  it('should accept valid arXiv formats', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.arxiv_id = '2501.06322';

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const formatIssue = result.value.issues.find((i) => i.code === 'INVALID_ARXIV_FORMAT');
      expect(formatIssue).toBeUndefined();
    }
  });

  it('should accept arXiv with version', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.arxiv_id = '2501.06322v2';

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const formatIssue = result.value.issues.find((i) => i.code === 'INVALID_ARXIV_FORMAT');
      expect(formatIssue).toBeUndefined();
    }
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe('formatValidationResult', () => {
  it('should format valid result', () => {
    const registry = createValidRegistry();
    // Add integration files to pass all checks
    registry.techniques.techniques['aegean-consensus']!.integration_files = ['src/test.ts'];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const formatted = formatValidationResult(result.value);
      expect(formatted).toContain('Errors:');
      expect(formatted).toContain('Warnings:');
    }
  });

  it('should format issues with suggestions', () => {
    const registry = createValidRegistry();
    registry.papers.papers['arxiv-2501.06322']!.techniques_extracted = ['non-existent'];

    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const formatted = formatValidationResult(result.value);
      expect(formatted).toContain('Suggestion:');
    }
  });
});

describe('formatValidationResultJson', () => {
  it('should produce valid JSON', () => {
    const registry = createValidRegistry();
    const result = validateRegistry(registry, { checkFileExistence: false });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const json = formatValidationResultJson(result.value);
      let parsed: { valid: boolean; issues: unknown[] } | undefined;
      expect(() => {
        parsed = JSON.parse(json) as { valid: boolean; issues: unknown[] };
      }).not.toThrow();

      expect(parsed).toBeDefined();
      if (parsed !== undefined) {
        expect(parsed.valid).toBeDefined();
        expect(parsed.issues).toBeDefined();
      }
    }
  });
});
