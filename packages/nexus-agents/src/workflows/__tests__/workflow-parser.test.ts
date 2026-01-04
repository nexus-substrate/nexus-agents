/**
 * @nexus-agents/workflows - Workflow Parser Tests
 *
 * Tests for YAML/JSON parsing, validation, and dependency graph analysis.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseWorkflowYaml,
  parseWorkflowJson,
  loadWorkflowFile,
  validateWorkflow,
} from '../workflow-parser.js';
import {
  buildDependencyGraph,
  validateDependencyGraph,
  getTopologicalOrder,
} from '../dependency-graph.js';
import type { WorkflowDefinition } from '../../core/index.js';

describe('parseWorkflowYaml', () => {
  it('should parse valid YAML workflow', () => {
    const yaml = `
name: test-workflow
version: "1.0.0"
description: A test workflow
inputs:
  - name: inputFile
    type: string
    required: true
steps:
  - id: step1
    agent: code_expert
    action: analyze
    inputs:
      file: "{{ inputs.inputFile }}"
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('test-workflow');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.inputs).toHaveLength(1);
      expect(result.value.steps).toHaveLength(1);
    }
  });

  it('should parse workflow with multiple steps and dependencies', () => {
    const yaml = `
name: multi-step-workflow
version: "2.0.0"
steps:
  - id: analyze
    agent: code_expert
    action: analyze_code
    inputs: {}
  - id: review
    agent: security_expert
    action: security_review
    dependsOn:
      - analyze
    inputs: {}
  - id: document
    agent: documentation_expert
    action: generate_docs
    dependsOn:
      - review
    inputs: {}
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(3);
      const step1 = result.value.steps[1];
      const step2 = result.value.steps[2];
      expect(step1).toBeDefined();
      expect(step2).toBeDefined();
      expect(step1?.dependsOn).toEqual(['analyze']);
      expect(step2?.dependsOn).toEqual(['review']);
    }
  });

  it('should return error for invalid YAML syntax', () => {
    const invalidYaml = `
name: test
version: 1.0.0
steps:
  - id: step1
    agent: code_expert
    action: test
      invalid: indentation
`;

    const result = parseWorkflowYaml(invalidYaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('YAML parse error');
    }
  });

  it('should return error for missing required fields', () => {
    const yaml = `
name: test-workflow
version: "1.0.0"
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Validation error');
      expect(result.error.message).toContain('steps');
    }
  });

  it('should return error for invalid version format', () => {
    const yaml = `
name: test
version: "invalid"
steps:
  - id: step1
    agent: code_expert
    action: test
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('semver');
    }
  });

  it('should return error for invalid agent role', () => {
    const yaml = `
name: test
version: "1.0.0"
steps:
  - id: step1
    agent: invalid_agent
    action: test
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Validation error');
    }
  });

  it('should return error for invalid step ID format', () => {
    const yaml = `
name: test
version: "1.0.0"
steps:
  - id: "123-invalid"
    agent: code_expert
    action: test
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('identifier');
    }
  });

  it('should parse workflow with optional fields', () => {
    const yaml = `
name: full-workflow
version: "1.0.0"
description: Full featured workflow
timeout: 30000
inputs:
  - name: config
    type: object
    required: false
    description: Configuration object
steps:
  - id: main_step
    agent: tech_lead
    action: coordinate
    inputs: {}
    parallel: true
    retries: 3
    timeout: 10000
    condition: "inputs.config !== undefined"
`;

    const result = parseWorkflowYaml(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timeout).toBe(30000);
      const input0 = result.value.inputs[0];
      const step0 = result.value.steps[0];
      expect(input0).toBeDefined();
      expect(step0).toBeDefined();
      expect(input0?.required).toBe(false);
      expect(step0?.parallel).toBe(true);
      expect(step0?.retries).toBe(3);
      expect(step0?.timeout).toBe(10000);
    }
  });
});

describe('parseWorkflowJson', () => {
  it('should parse valid JSON workflow', () => {
    const json = JSON.stringify({
      name: 'json-workflow',
      version: '1.0.0',
      steps: [
        {
          id: 'step1',
          agent: 'code_expert',
          action: 'execute',
          inputs: { key: 'value' },
        },
      ],
    });

    const result = parseWorkflowJson(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('json-workflow');
      const step0 = result.value.steps[0];
      expect(step0).toBeDefined();
      expect(step0?.inputs).toEqual({ key: 'value' });
    }
  });

  it('should return error for invalid JSON syntax', () => {
    const invalidJson = '{ "name": "test", version: "1.0.0" }';

    const result = parseWorkflowJson(invalidJson);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('JSON parse error');
    }
  });

  it('should return error for extra fields (strict mode)', () => {
    const json = JSON.stringify({
      name: 'test',
      version: '1.0.0',
      extraField: 'should fail',
      steps: [
        {
          id: 'step1',
          agent: 'code_expert',
          action: 'test',
        },
      ],
    });

    const result = parseWorkflowJson(json);
    expect(result.ok).toBe(false);
  });
});

describe('loadWorkflowFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should load YAML file', async () => {
    const filePath = path.join(tempDir, 'workflow.yaml');
    await fs.writeFile(
      filePath,
      `
name: file-workflow
version: "1.0.0"
steps:
  - id: step1
    agent: code_expert
    action: test
`
    );

    const result = await loadWorkflowFile(filePath, tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('file-workflow');
    }
  });

  it('should load YML file', async () => {
    const filePath = path.join(tempDir, 'workflow.yml');
    await fs.writeFile(
      filePath,
      `
name: yml-workflow
version: "1.0.0"
steps:
  - id: step1
    agent: code_expert
    action: test
`
    );

    const result = await loadWorkflowFile(filePath, tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('yml-workflow');
    }
  });

  it('should load JSON file', async () => {
    const filePath = path.join(tempDir, 'workflow.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({
        name: 'json-file-workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'step1',
            agent: 'code_expert',
            action: 'test',
          },
        ],
      })
    );

    const result = await loadWorkflowFile(filePath, tempDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('json-file-workflow');
    }
  });

  it('should return error for unsupported extension', async () => {
    const filePath = path.join(tempDir, 'workflow.txt');
    await fs.writeFile(filePath, 'content');

    const result = await loadWorkflowFile(filePath, tempDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unsupported file extension');
    }
  });

  it('should return error for non-existent file', async () => {
    const result = await loadWorkflowFile('nonexistent-workflow.yaml', tempDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('File not found');
    }
  });

  it('should return error for path traversal attempt', async () => {
    const result = await loadWorkflowFile('../../../etc/passwd', tempDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Path traversal detected');
    }
  });
});

describe('validateWorkflow', () => {
  it('should validate a correct workflow object', () => {
    const workflow: WorkflowDefinition = {
      name: 'valid-workflow',
      version: '1.0.0',
      inputs: [],
      steps: [
        {
          id: 'step1',
          agent: 'code_expert',
          action: 'execute',
          inputs: {},
        },
      ],
    };

    const result = validateWorkflow(workflow);
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid workflow', () => {
    const workflow = {
      name: 'invalid',
      version: 'not-semver',
      steps: [],
    } as unknown as WorkflowDefinition;

    const result = validateWorkflow(workflow);
    expect(result.ok).toBe(false);
  });
});

describe('DependencyGraph', () => {
  describe('validateDependencyGraph', () => {
    it('should validate workflow with no dependencies', () => {
      const workflow: WorkflowDefinition = {
        name: 'no-deps',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {} },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(true);
    });

    it('should validate workflow with valid dependencies', () => {
      const workflow: WorkflowDefinition = {
        name: 'valid-deps',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
          { id: 'c', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a', 'b'] },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(true);
    });

    it('should detect duplicate step IDs', () => {
      const workflow: WorkflowDefinition = {
        name: 'dup-ids',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'step1', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'step1', agent: 'code_expert', action: 'test', inputs: {} },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Duplicate step IDs');
      }
    });

    it('should detect missing step references', () => {
      const workflow: WorkflowDefinition = {
        name: 'missing-ref',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['nonexistent'] },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('non-existent step');
        expect(result.error.message).toContain('nonexistent');
      }
    });

    it('should detect simple circular dependency', () => {
      const workflow: WorkflowDefinition = {
        name: 'simple-cycle',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['b'] },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular dependency');
      }
    });

    it('should detect complex circular dependency', () => {
      const workflow: WorkflowDefinition = {
        name: 'complex-cycle',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
          { id: 'c', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['b'] },
          { id: 'd', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['c', 'e'] },
          { id: 'e', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['d'] },
        ],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular dependency');
      }
    });

    it('should detect self-reference', () => {
      const workflow: WorkflowDefinition = {
        name: 'self-ref',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 'a', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] }],
      };

      const result = validateDependencyGraph(workflow);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Circular dependency');
      }
    });
  });

  describe('getTopologicalOrder', () => {
    it('should return correct execution order for linear workflow', () => {
      const workflow: WorkflowDefinition = {
        name: 'linear',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'c', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['b'] },
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const result = getTopologicalOrder(workflow);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value;
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
      }
    });

    it('should return valid order for diamond dependency', () => {
      const workflow: WorkflowDefinition = {
        name: 'diamond',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
          { id: 'c', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
          { id: 'd', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['b', 'c'] },
        ],
      };

      const result = getTopologicalOrder(workflow);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const order = result.value;
        // 'a' must come before 'b' and 'c'
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
        expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
        // 'd' must come after both 'b' and 'c'
        expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
        expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
      }
    });

    it('should return error for cyclic workflow', () => {
      const workflow: WorkflowDefinition = {
        name: 'cycle',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['c'] },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
          { id: 'c', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['b'] },
        ],
      };

      const result = getTopologicalOrder(workflow);
      expect(result.ok).toBe(false);
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build graph with correct structure', () => {
      const workflow: WorkflowDefinition = {
        name: 'test',
        version: '1.0.0',
        inputs: [],
        steps: [
          { id: 'a', agent: 'code_expert', action: 'test', inputs: {} },
          { id: 'b', agent: 'code_expert', action: 'test', inputs: {}, dependsOn: ['a'] },
        ],
      };

      const graph = buildDependencyGraph(workflow);
      expect(graph.getStepIds()).toContain('a');
      expect(graph.getStepIds()).toContain('b');

      const nodeA = graph.getNode('a');
      expect(nodeA?.dependencies.size).toBe(0);

      const nodeB = graph.getNode('b');
      expect(nodeB?.dependencies.has('a')).toBe(true);
    });
  });
});

describe('Integration Tests', () => {
  it('should parse, validate, and get execution order for complex workflow', () => {
    const yaml = `
name: complex-workflow
version: "1.0.0"
description: A complex multi-step workflow
timeout: 60000
inputs:
  - name: sourceDir
    type: string
    required: true
  - name: outputFormat
    type: string
    required: false
    default: json
steps:
  - id: scan
    agent: code_expert
    action: scan_files
    inputs:
      directory: "{{ inputs.sourceDir }}"
    timeout: 10000

  - id: analyze
    agent: architecture_expert
    action: analyze_structure
    inputs: {}
    dependsOn:
      - scan
    retries: 2

  - id: security_check
    agent: security_expert
    action: check_vulnerabilities
    inputs: {}
    dependsOn:
      - scan
    parallel: true

  - id: generate_docs
    agent: documentation_expert
    action: generate
    inputs:
      format: "{{ inputs.outputFormat }}"
    dependsOn:
      - analyze
      - security_check

  - id: final_review
    agent: tech_lead
    action: review
    inputs: {}
    dependsOn:
      - generate_docs
`;

    // Parse
    const parseResult = parseWorkflowYaml(yaml);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const workflow = parseResult.value;

    // Validate
    const validateResult = validateWorkflow(workflow);
    expect(validateResult.ok).toBe(true);

    // Get execution order
    const orderResult = getTopologicalOrder(workflow);
    expect(orderResult.ok).toBe(true);
    if (!orderResult.ok) return;

    const order = orderResult.value;

    // Verify order constraints
    expect(order.indexOf('scan')).toBeLessThan(order.indexOf('analyze'));
    expect(order.indexOf('scan')).toBeLessThan(order.indexOf('security_check'));
    expect(order.indexOf('analyze')).toBeLessThan(order.indexOf('generate_docs'));
    expect(order.indexOf('security_check')).toBeLessThan(order.indexOf('generate_docs'));
    expect(order.indexOf('generate_docs')).toBeLessThan(order.indexOf('final_review'));
  });
});
