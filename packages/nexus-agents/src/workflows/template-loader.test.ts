/**
 * Tests for Template Loader
 * @module workflows/template-loader.test
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  parseTemplateContent,
  loadTemplateFile,
  loadTemplatesFromDirectory,
  getBuiltInTemplates,
  getBuiltInTemplatesWithMetadata,
  getBuiltInTemplatesPath,
} from './template-loader.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(currentDir, 'templates');

// Minimal valid YAML template content
const VALID_TEMPLATE_YAML = `
name: test-workflow
version: "1.0.0"
description: A test workflow
steps:
  - id: step-1
    agent: code_expert
    action: review code
`;

const MINIMAL_TEMPLATE_YAML = `
name: minimal
version: "1.0.0"
steps:
  - id: step-1
    agent: code_expert
    action: do thing
`;

// ============================================================================
// parseTemplateContent
// ============================================================================

describe('parseTemplateContent', () => {
  it('parses valid YAML template', () => {
    const result = parseTemplateContent(VALID_TEMPLATE_YAML, 'test.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test-workflow');
      expect(result.value.version).toBe('1.0.0');
    }
  });

  it('parses minimal template without optional fields', () => {
    const result = parseTemplateContent(MINIMAL_TEMPLATE_YAML, 'minimal.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('minimal');
      expect(result.value.steps).toHaveLength(1);
    }
  });

  it('returns error for missing name', () => {
    const yaml = `
version: "1.0.0"
steps:
  - id: step-1
    agent: code_expert
    action: test
`;
    const result = parseTemplateContent(yaml, 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('returns error for missing steps', () => {
    const yaml = `
name: no-steps
version: "1.0.0"
`;
    const result = parseTemplateContent(yaml, 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('returns error for empty steps array', () => {
    const yaml = `
name: empty-steps
version: "1.0.0"
steps: []
`;
    const result = parseTemplateContent(yaml, 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid version format', () => {
    const yaml = `
name: bad-version
version: "not-semver"
steps:
  - id: step-1
    agent: code_expert
    action: test
`;
    const result = parseTemplateContent(yaml, 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid YAML syntax', () => {
    const result = parseTemplateContent('{ invalid: yaml: [', 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('returns error for non-object YAML', () => {
    const result = parseTemplateContent('just a string', 'bad.yaml');
    expect(result.ok).toBe(false);
  });

  it('parses template with inputs', () => {
    const yaml = `
name: with-inputs
version: "1.0.0"
inputs:
  - name: url
    type: string
    description: The URL to review
    required: true
steps:
  - id: step-1
    agent: code_expert
    action: review
`;
    const result = parseTemplateContent(yaml, 'inputs.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inputs).toHaveLength(1);
      expect(result.value.inputs[0]?.name).toBe('url');
    }
  });

  it('parses template with step dependencies', () => {
    const yaml = `
name: deps
version: "1.0.0"
steps:
  - id: analyze
    agent: code_expert
    action: analyze code
  - id: report
    agent: documentation_expert
    action: write report
    dependsOn:
      - analyze
`;
    const result = parseTemplateContent(yaml, 'deps.yaml');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(2);
      expect(result.value.steps[1]?.dependsOn).toContain('analyze');
    }
  });
});

// ============================================================================
// loadTemplateFile
// ============================================================================

describe('loadTemplateFile', () => {
  it('loads a built-in template file', async () => {
    const codereviewPath = join(TEMPLATES_DIR, 'code-review.yaml');
    const result = await loadTemplateFile(codereviewPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.definition.name).toBe('code-review');
      expect(result.value.metadata.builtIn).toBe(true);
    }
  });

  it('rejects path traversal when allowedRoot provided', async () => {
    const result = await loadTemplateFile('../../../etc/passwd', TEMPLATES_DIR);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Path traversal');
    }
  });

  it('returns error for nonexistent file', async () => {
    const result = await loadTemplateFile(join(TEMPLATES_DIR, 'nonexistent.yaml'));
    expect(result.ok).toBe(false);
  });

  it('includes metadata for built-in templates', async () => {
    const path = join(TEMPLATES_DIR, 'code-review.yaml');
    const result = await loadTemplateFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata.builtIn).toBe(true);
      expect(result.value.metadata.category).not.toBe('custom');
    }
  });
});

// ============================================================================
// loadTemplatesFromDirectory
// ============================================================================

describe('loadTemplatesFromDirectory', () => {
  it('loads all templates from built-in directory', async () => {
    const result = await loadTemplatesFromDirectory(TEMPLATES_DIR);
    expect(result.templates.length).toBeGreaterThanOrEqual(9);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for nonexistent directory', async () => {
    const result = await loadTemplatesFromDirectory('/nonexistent/path');
    expect(result.templates).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns error for file path instead of directory', async () => {
    const filePath = join(TEMPLATES_DIR, 'code-review.yaml');
    const result = await loadTemplatesFromDirectory(filePath);
    expect(result.templates).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('each loaded template has valid metadata', async () => {
    const result = await loadTemplatesFromDirectory(TEMPLATES_DIR);
    for (const template of result.templates) {
      expect(template.metadata.name).toBeTruthy();
      expect(template.metadata.version).toBeTruthy();
      expect(template.metadata.category).toBeTruthy();
      expect(template.metadata.builtIn).toBe(true);
    }
  });
});

// ============================================================================
// getBuiltInTemplatesPath
// ============================================================================

describe('getBuiltInTemplatesPath', () => {
  it('returns a valid path string', () => {
    const path = getBuiltInTemplatesPath();
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  it('returned path contains templates', () => {
    const path = getBuiltInTemplatesPath();
    expect(path).toContain('templates');
  });
});

// ============================================================================
// getBuiltInTemplates
// ============================================================================

describe('getBuiltInTemplates', () => {
  it('returns a map of built-in template definitions', async () => {
    const templates = await getBuiltInTemplates();
    expect(templates).toBeInstanceOf(Map);
    expect(templates.size).toBeGreaterThanOrEqual(9);
  });

  it('includes code-review template', async () => {
    const templates = await getBuiltInTemplates();
    expect(templates.has('code-review')).toBe(true);
    const codeReview = templates.get('code-review');
    expect(codeReview?.steps.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// getBuiltInTemplatesWithMetadata
// ============================================================================

describe('getBuiltInTemplatesWithMetadata', () => {
  it('returns array of parsed templates with metadata', async () => {
    const templates = await getBuiltInTemplatesWithMetadata();
    expect(templates.length).toBeGreaterThanOrEqual(9);
    for (const t of templates) {
      expect(t.definition).toBeDefined();
      expect(t.metadata).toBeDefined();
      expect(t.metadata.builtIn).toBe(true);
    }
  });
});
