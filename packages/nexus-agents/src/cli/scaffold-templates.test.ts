/**
 * Tests for scaffold-templates.ts
 *
 * Covers template generation for tools, experts, workflows, and commands.
 */

import { describe, it, expect } from 'vitest';
import {
  generateToolFiles,
  generateExpertFiles,
  generateWorkflowFiles,
  generateCommandFiles,
} from './scaffold-templates.js';

// ============================================================================
// generateToolFiles
// ============================================================================

describe('generateToolFiles', () => {
  it('generates source and test files', () => {
    const files = generateToolFiles('my-tool');
    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe('src/mcp/tools/my-tool.ts');
    expect(files[1]?.path).toBe('src/mcp/tools/my-tool.test.ts');
  });

  it('uses PascalCase in generated content', () => {
    const files = generateToolFiles('data-sync');
    const source = files[0]?.content ?? '';
    expect(source).toContain('DataSync');
    expect(source).toContain('DataSyncInputSchema');
  });

  it('includes zod import in source', () => {
    const files = generateToolFiles('my-tool');
    const source = files[0]?.content ?? '';
    expect(source).toContain("import { z } from 'zod'");
  });

  it('includes test expectations in test file', () => {
    const files = generateToolFiles('my-tool');
    const test = files[1]?.content ?? '';
    expect(test).toContain('describe');
    expect(test).toContain('expect');
  });
});

// ============================================================================
// generateExpertFiles
// ============================================================================

describe('generateExpertFiles', () => {
  it('generates knowledge module file', () => {
    const files = generateExpertFiles('performance');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/agents/experts/knowledge/performance/index.ts');
  });

  it('uses SCREAMING_SNAKE for constants', () => {
    const files = generateExpertFiles('data-quality');
    const content = files[0]?.content ?? '';
    expect(content).toContain('DATA_QUALITY_PATTERNS');
    expect(content).toContain('DATA_QUALITY_BEST_PRACTICES');
  });

  it('includes PascalCase in comments', () => {
    const files = generateExpertFiles('code-review');
    const content = files[0]?.content ?? '';
    expect(content).toContain('CodeReview');
  });
});

// ============================================================================
// generateWorkflowFiles
// ============================================================================

describe('generateWorkflowFiles', () => {
  it('generates YAML workflow template', () => {
    const files = generateWorkflowFiles('code-audit');
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('src/workflows/templates/code-audit.yaml');
  });

  it('includes workflow name in YAML', () => {
    const files = generateWorkflowFiles('security-scan');
    const content = files[0]?.content ?? '';
    expect(content).toContain('name: "security-scan"');
  });

  it('has analyze and report steps', () => {
    const files = generateWorkflowFiles('review');
    const content = files[0]?.content ?? '';
    expect(content).toContain('id: "analyze"');
    expect(content).toContain('id: "report"');
  });

  it('report step depends on analyze', () => {
    const files = generateWorkflowFiles('review');
    const content = files[0]?.content ?? '';
    expect(content).toContain('dependsOn: ["analyze"]');
  });
});

// ============================================================================
// generateCommandFiles
// ============================================================================

describe('generateCommandFiles', () => {
  it('generates source and test files', () => {
    const files = generateCommandFiles('deploy');
    expect(files).toHaveLength(2);
    expect(files[0]?.path).toBe('src/cli/deploy.ts');
    expect(files[1]?.path).toBe('src/cli/deploy.test.ts');
  });

  it('uses PascalCase for types in source', () => {
    const files = generateCommandFiles('health-check');
    const source = files[0]?.content ?? '';
    expect(source).toContain('HealthCheck');
  });

  it('uses camelCase for function names', () => {
    const files = generateCommandFiles('run-audit');
    const source = files[0]?.content ?? '';
    expect(source).toContain('runAuditCommand');
  });

  it('includes test file with describe block', () => {
    const files = generateCommandFiles('deploy');
    const test = files[1]?.content ?? '';
    expect(test).toContain('describe');
    expect(test).toContain('deploy');
  });
});
