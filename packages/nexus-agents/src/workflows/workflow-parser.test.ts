/**
 * Tests for workflow-parser.ts
 *
 * Covers YAML/JSON parsing, Zod schema validation,
 * path traversal prevention, file loading, and dependency graph validation.
 */

import { describe, it, expect } from 'vitest';
import { parseWorkflowYaml, parseWorkflowJson, validateWorkflow } from './workflow-parser.js';
import { WorkflowDefinitionSchema, WorkflowStepSchema } from './workflow-types.js';

// ============================================================================
// Fixtures
// ============================================================================

const MINIMAL_YAML = `
name: test-workflow
version: 1.0.0
steps:
  - id: step1
    agent: code_expert
    action: Implement feature
`;

const FULL_YAML = `
name: review-workflow
version: 2.1.0
description: A code review workflow
inputs:
  - name: repo_url
    type: string
    required: true
    description: Repository URL
  - name: max_depth
    type: number
    required: false
    default: 10
steps:
  - id: analyze
    agent: architecture_expert
    action: Analyze codebase
    timeout: 60000
  - id: review
    agent: code_expert
    action: Review code
    dependsOn:
      - analyze
    retries: 2
  - id: report
    agent: documentation_expert
    action: Generate report
    dependsOn:
      - review
    condition: "steps.review.output.issues > 0"
timeout: 300000
`;

const MINIMAL_JSON_OBJ = {
  name: 'test-workflow',
  version: '1.0.0',
  steps: [{ id: 'step1', agent: 'code_expert', action: 'Do something' }],
};

const INTENTIONALLY_DROPPED = {
  workflow: new Set<string>(),
  step: new Set<string>(),
};

// ============================================================================
// parseWorkflowYaml
// ============================================================================

describe('parseWorkflowYaml', () => {
  it('parses minimal valid YAML workflow', () => {
    const result = parseWorkflowYaml(MINIMAL_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test-workflow');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.steps).toHaveLength(1);
      expect(result.value.steps[0]?.id).toBe('step1');
    }
  });

  it('parses full YAML with inputs, dependencies, and options', () => {
    const result = parseWorkflowYaml(FULL_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('review-workflow');
      expect(result.value.description).toBe('A code review workflow');
      expect(result.value.inputs).toHaveLength(2);
      expect(result.value.inputs[0]?.name).toBe('repo_url');
      expect(result.value.inputs[0]?.required).toBe(true);
      expect(result.value.inputs[1]?.default).toBe(10);
      expect(result.value.steps).toHaveLength(3);
      expect(result.value.steps[1]?.dependsOn).toEqual(['analyze']);
      expect(result.value.steps[1]?.retries).toBe(2);
      expect(result.value.steps[2]?.condition).toContain('issues');
      expect(result.value.timeout).toBe(300000);
    }
  });

  it('returns error for invalid YAML syntax', () => {
    const badYaml = `
name: test
version: 1.0.0
steps:
  - id: [unterminated
`;
    const result = parseWorkflowYaml(badYaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('YAML parse error');
    }
  });

  it('returns error for missing required fields', () => {
    const noSteps = `
name: test
version: 1.0.0
`;
    const result = parseWorkflowYaml(noSteps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Validation error');
    }
  });

  it('returns error for invalid version format', () => {
    const badVersion = `
name: test
version: not-semver
steps:
  - id: step1
    agent: code_expert
    action: Do something
`;
    const result = parseWorkflowYaml(badVersion);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('semver');
    }
  });

  it('returns error for invalid agent role', () => {
    const badAgent = `
name: test
version: 1.0.0
steps:
  - id: step1
    agent: nonexistent_expert
    action: Do something
`;
    const result = parseWorkflowYaml(badAgent);
    expect(result.ok).toBe(false);
  });

  it('returns error for empty step action', () => {
    const emptyAction = `
name: test
version: 1.0.0
steps:
  - id: step1
    agent: code_expert
    action: ""
`;
    const result = parseWorkflowYaml(emptyAction);
    expect(result.ok).toBe(false);
  });

  it('returns error for invalid input name format', () => {
    const badInputName = `
name: test
version: 1.0.0
inputs:
  - name: "123-invalid"
    type: string
steps:
  - id: step1
    agent: code_expert
    action: Do something
`;
    const result = parseWorkflowYaml(badInputName);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('identifier');
    }
  });

  it('returns error for circular dependencies', () => {
    const circular = `
name: test
version: 1.0.0
steps:
  - id: step_a
    agent: code_expert
    action: First step
    dependsOn:
      - step_b
  - id: step_b
    agent: code_expert
    action: Second step
    dependsOn:
      - step_a
`;
    const result = parseWorkflowYaml(circular);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('returns error for missing dependency reference', () => {
    const missingDep = `
name: test
version: 1.0.0
steps:
  - id: step1
    agent: code_expert
    action: Do something
    dependsOn:
      - nonexistent
`;
    const result = parseWorkflowYaml(missingDep);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('non-existent');
    }
  });

  it('accepts valid semver with prerelease', () => {
    const prerelease = `
name: test
version: 1.0.0-beta.1
steps:
  - id: step1
    agent: code_expert
    action: Do something
`;
    const result = parseWorkflowYaml(prerelease);
    expect(result.ok).toBe(true);
  });

  it('rejects extra unknown properties (strict mode)', () => {
    const extraProps = `
name: test
version: 1.0.0
unknownField: value
steps:
  - id: step1
    agent: code_expert
    action: Do something
`;
    const result = parseWorkflowYaml(extraProps);
    expect(result.ok).toBe(false);
  });

  it('defaults inputs to empty array when omitted', () => {
    const result = parseWorkflowYaml(MINIMAL_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inputs).toEqual([]);
    }
  });
});

// ============================================================================
// parseWorkflowJson
// ============================================================================

describe('parseWorkflowJson', () => {
  it('parses valid JSON workflow', () => {
    const result = parseWorkflowJson(JSON.stringify(MINIMAL_JSON_OBJ));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test-workflow');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.steps).toHaveLength(1);
    }
  });

  it('returns error for invalid JSON syntax', () => {
    const result = parseWorkflowJson('{ invalid json }');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('JSON parse error');
    }
  });

  it('returns error for schema validation failure', () => {
    const result = parseWorkflowJson(JSON.stringify({ name: 'test' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Validation error');
    }
  });

  it('parses JSON with all optional fields', () => {
    const full = {
      name: 'full-workflow',
      version: '1.0.0',
      description: 'Full workflow',
      inputs: [{ name: 'url', type: 'string', required: true }],
      steps: [
        {
          id: 'step1',
          agent: 'security_expert',
          action: 'Audit code',
          inputs: { target: 'src/' },
          retries: 3,
          timeout: 30000,
          parallel: true,
        },
      ],
      timeout: 120000,
    };
    const result = parseWorkflowJson(JSON.stringify(full));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.description).toBe('Full workflow');
      expect(result.value.steps[0]?.retries).toBe(3);
      expect(result.value.steps[0]?.parallel).toBe(true);
    }
  });

  it('preserves workflow and step context budgets', () => {
    const defaultBudget = { system: 0.15, task: 0.2, active: 0.5, reserved: 0.15 };
    const contextBudget = { active: 0.65, reserved: 0.2 };
    const definition = {
      ...MINIMAL_JSON_OBJ,
      defaultBudget,
      steps: [{ ...MINIMAL_JSON_OBJ.steps[0], contextBudget }],
    };

    const result = parseWorkflowJson(JSON.stringify(definition));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultBudget).toEqual(defaultBudget);
      expect(result.value.steps[0]?.contextBudget).toEqual(contextBudget);
    }
  });

  it('omits absent workflow and step context budget keys', () => {
    const result = parseWorkflowJson(JSON.stringify(MINIMAL_JSON_OBJ));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toHaveProperty('defaultBudget');
      expect(result.value.steps[0]).not.toHaveProperty('contextBudget');
    }
  });

  it('maps every accepted workflow and step schema key', () => {
    const definition = {
      name: 'schema-parity',
      version: '1.0.0',
      description: 'Exercises every accepted parser field',
      inputs: [],
      steps: [
        {
          id: 'step1',
          agent: 'code_expert',
          action: 'Exercise parser mapping',
          inputs: { target: 'src/' },
          dependsOn: [],
          parallel: true,
          retries: 1,
          timeout: 30000,
          condition: 'true',
          contextBudget: { active: 0.5 },
        },
      ],
      timeout: 120000,
      defaultBudget: { system: 0.15, task: 0.2, active: 0.5, reserved: 0.15 },
    };

    const result = parseWorkflowJson(JSON.stringify(definition));

    expect(result.ok).toBe(true);
    expect(INTENTIONALLY_DROPPED.workflow.size).toBe(0);
    expect(INTENTIONALLY_DROPPED.step.size).toBe(0);
    if (result.ok) {
      const workflowKeys = [...Object.keys(result.value), ...INTENTIONALLY_DROPPED.workflow];
      const stepKeys = [...Object.keys(result.value.steps[0] ?? {}), ...INTENTIONALLY_DROPPED.step];
      expect(workflowKeys.sort()).toEqual(Object.keys(WorkflowDefinitionSchema.shape).sort());
      expect(stepKeys.sort()).toEqual(Object.keys(WorkflowStepSchema.shape).sort());
    }
  });

  it('validates step ID format', () => {
    const badId = {
      ...MINIMAL_JSON_OBJ,
      steps: [{ id: '123-bad', agent: 'code_expert', action: 'Do' }],
    };
    const result = parseWorkflowJson(JSON.stringify(badId));
    expect(result.ok).toBe(false);
  });

  it('validates input types enum', () => {
    const badType = {
      ...MINIMAL_JSON_OBJ,
      inputs: [{ name: 'x', type: 'invalid_type', required: true }],
    };
    const result = parseWorkflowJson(JSON.stringify(badType));
    expect(result.ok).toBe(false);
  });

  it('rejects retries above max (10)', () => {
    const tooManyRetries = {
      ...MINIMAL_JSON_OBJ,
      steps: [{ id: 'step1', agent: 'code_expert', action: 'Do', retries: 15 }],
    };
    const result = parseWorkflowJson(JSON.stringify(tooManyRetries));
    expect(result.ok).toBe(false);
  });

  it('rejects negative timeout', () => {
    const negTimeout = {
      ...MINIMAL_JSON_OBJ,
      steps: [{ id: 'step1', agent: 'code_expert', action: 'Do', timeout: -100 }],
    };
    const result = parseWorkflowJson(JSON.stringify(negTimeout));
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// validateWorkflow
// ============================================================================

describe('validateWorkflow', () => {
  it('validates a correct workflow definition', () => {
    const yamlResult = parseWorkflowYaml(FULL_YAML);
    expect(yamlResult.ok).toBe(true);
    if (yamlResult.ok) {
      const result = validateWorkflow(yamlResult.value);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects workflow with empty name', () => {
    const result = validateWorkflow({
      name: '',
      version: '1.0.0',
      inputs: [],
      steps: [{ id: 'step1', agent: 'code_expert', action: 'Do', inputs: {} }],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects workflow with no steps', () => {
    const result = validateWorkflow({
      name: 'test',
      version: '1.0.0',
      inputs: [],
      steps: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rejects workflow with circular dependencies', () => {
    const result = validateWorkflow({
      name: 'test',
      version: '1.0.0',
      inputs: [],
      steps: [
        { id: 'a', agent: 'code_expert', action: 'Do A', inputs: {}, dependsOn: ['b'] },
        { id: 'b', agent: 'code_expert', action: 'Do B', inputs: {}, dependsOn: ['a'] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Circular');
    }
  });

  it('rejects workflow with missing dependency references', () => {
    const result = validateWorkflow({
      name: 'test',
      version: '1.0.0',
      inputs: [],
      steps: [
        { id: 'step1', agent: 'code_expert', action: 'Do', inputs: {}, dependsOn: ['missing'] },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts workflow with valid linear dependencies', () => {
    const result = validateWorkflow({
      name: 'test',
      version: '1.0.0',
      inputs: [],
      steps: [
        { id: 'first', agent: 'code_expert', action: 'Do first', inputs: {} },
        {
          id: 'second',
          agent: 'code_expert',
          action: 'Do second',
          inputs: {},
          dependsOn: ['first'],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
