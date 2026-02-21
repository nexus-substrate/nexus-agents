/**
 * Tests for predefined graph workflow templates.
 *
 * (Source: Issue #841 — Real-world graph workflow templates)
 */

import { describe, it, expect } from 'vitest';
import { getGraphRegistry, getGraphWorkflowList } from './run-graph-workflow-templates.js';
import { executeGraph } from '../../orchestration/graph/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getGraph(name: string) {
  const registry = getGraphRegistry();
  const factory = registry.get(name);
  if (factory === undefined) throw new Error(`No factory for '${name}'`);
  const graph = factory();
  if (graph === undefined) throw new Error(`Failed to compile '${name}'`);
  return graph;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function runWorkflow(name: string, inputs: Record<string, unknown>) {
  const graph = getGraph(name);
  const result = await executeGraph(graph, inputs);
  if (!result.ok) throw new Error(`Execution failed: ${result.error.message}`);
  return result.value;
}

// ============================================================================
// Registry
// ============================================================================

describe('getGraphRegistry', () => {
  it('contains 10 workflows (4 built-in + 3 multi-CLI + 3 security-setup)', () => {
    const registry = getGraphRegistry();
    expect(registry.size).toBe(10);
    expect([...registry.keys()]).toEqual([
      'echo',
      'pipeline',
      'code-review',
      'security-scan',
      'security-audit',
      'test-generation',
      'documentation',
      'security-setup-semgrep',
      'security-setup-zap',
      'security-setup-trivy',
    ]);
  });

  it('all factories produce valid compiled graphs', () => {
    const registry = getGraphRegistry();
    for (const [name, factory] of registry) {
      const graph = factory();
      expect(graph, `${name} factory returned undefined`).toBeDefined();
    }
  });
});

// ============================================================================
// Workflow List (Discoverability)
// ============================================================================

describe('getGraphWorkflowList', () => {
  it('returns metadata for all registered workflows', () => {
    const list = getGraphWorkflowList();
    const registry = getGraphRegistry();
    expect(list.length).toBe(registry.size);
  });

  it('includes name, description, and input fields for each workflow', () => {
    const list = getGraphWorkflowList();
    for (const info of list) {
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info.inputFields.length).toBeGreaterThan(0);
      expect(info.nodeCount).toBeGreaterThan(0);
    }
  });

  it('marks workflows with conditional edges correctly', () => {
    const list = getGraphWorkflowList();
    const echo = list.find((w) => w.name === 'echo');
    const codeReview = list.find((w) => w.name === 'code-review');
    expect(echo?.hasConditionalEdges).toBe(false);
    expect(codeReview?.hasConditionalEdges).toBe(true);
  });

  it('names match registry keys', () => {
    const list = getGraphWorkflowList();
    const registry = getGraphRegistry();
    const listNames = list.map((w) => w.name);
    const registryNames = [...registry.keys()];
    expect(listNames).toEqual(registryNames);
  });
});

// ============================================================================
// Code Review Workflow
// ============================================================================

describe('code-review workflow', () => {
  const simpleCode = 'const x = 1;\nconst y = 2;\n';
  const complexCode = Array.from(
    { length: 60 },
    (_, i) => `if (x${String(i)}) { for (let j = 0; j < n; j++) { while (true) { break; } } }`
  ).join('\n');

  it('routes simple code through quick_review', async () => {
    const result = await runWorkflow('code-review', { code: simpleCode });

    expect(result.finalState['complexity']).toBeLessThan(50);
    const summary = String(result.finalState['summary']);
    expect(summary).toContain('quick');
  });

  it('routes complex code through deep_review', async () => {
    const result = await runWorkflow('code-review', { code: complexCode });

    expect(Number(result.finalState['complexity'])).toBeGreaterThanOrEqual(50);
    const summary = String(result.finalState['summary']);
    expect(summary).toContain('deep');
  });

  it('accumulates findings via append reducer', async () => {
    const result = await runWorkflow('code-review', { code: simpleCode });

    const findings = result.finalState['findings'] as string[];
    expect(findings.length).toBeGreaterThanOrEqual(2);
    expect(findings[0]).toContain('Complexity score');
  });

  it('detects eval in deep review', async () => {
    const codeWithEval = complexCode + '\neval("alert(1)")';
    const result = await runWorkflow('code-review', { code: codeWithEval });

    const findings = result.finalState['findings'] as string[];
    const evalFinding = findings.find((f) => f.includes('eval()'));
    expect(evalFinding).toBeDefined();
  });

  it('detects TODO in quick review', async () => {
    const codeWithTodo = 'const x = 1; // TODO: fix this\n';
    const result = await runWorkflow('code-review', { code: codeWithTodo });

    const findings = result.finalState['findings'] as string[];
    const todoFinding = findings.find((f) => f.includes('TODO'));
    expect(todoFinding).toBeDefined();
  });

  it('executes 3 nodes (analyze → review → summarize)', async () => {
    const result = await runWorkflow('code-review', { code: simpleCode });
    expect(result.nodeResults.length).toBe(3);
  });

  it('generates summary with finding count', async () => {
    const result = await runWorkflow('code-review', { code: simpleCode });
    const summary = String(result.finalState['summary']);
    expect(summary).toMatch(/\d+ findings/);
  });
});

// ============================================================================
// Security Scan Workflow
// ============================================================================

describe('security-scan workflow', () => {
  const cleanCode = 'const x = 1;\nconst y = 2;\n';
  const dangerousCode = [
    'import { exec } from "child_process";',
    'eval(userInput);',
    'const password = "hunter2";',
    'fetch("http://api.example.com");',
  ].join('\n');

  it('routes clean code through standard_report', async () => {
    const result = await runWorkflow('security-scan', { code: cleanCode });

    expect(Number(result.finalState['severity'])).toBeLessThan(5);
    const report = String(result.finalState['report']);
    expect(report).toContain('PASS');
    expect(report).toContain('No vulnerabilities detected');
  });

  it('routes dangerous code through critical_report', async () => {
    const result = await runWorkflow('security-scan', { code: dangerousCode });

    expect(Number(result.finalState['severity'])).toBeGreaterThanOrEqual(5);
    const report = String(result.finalState['report']);
    expect(report).toContain('CRITICAL');
    expect(report).toContain('Immediate remediation required');
  });

  it('accumulates vulnerabilities across scan stages', async () => {
    const result = await runWorkflow('security-scan', { code: dangerousCode });

    const vulns = result.finalState['vulnerabilities'] as string[];
    expect(vulns.length).toBeGreaterThanOrEqual(4);
  });

  it('detects CWE-78 (OS command injection)', async () => {
    const code = 'import { exec } from "child_process";\nexec(cmd);';
    const result = await runWorkflow('security-scan', { code });

    const vulns = result.finalState['vulnerabilities'] as string[];
    expect(vulns.some((v) => v.includes('CWE-78'))).toBe(true);
  });

  it('detects CWE-798 (hardcoded credentials)', async () => {
    const code = 'const password = "secret123";\n';
    const result = await runWorkflow('security-scan', { code });

    const vulns = result.finalState['vulnerabilities'] as string[];
    expect(vulns.some((v) => v.includes('CWE-798'))).toBe(true);
  });

  it('detects CWE-79 (XSS via innerHTML)', async () => {
    const code = 'element.innerHTML = userInput;\n';
    const result = await runWorkflow('security-scan', { code });

    const vulns = result.finalState['vulnerabilities'] as string[];
    expect(vulns.some((v) => v.includes('CWE-79'))).toBe(true);
  });

  it('detects CWE-319 (cleartext HTTP)', async () => {
    const code = 'fetch("http://example.com/api");\n';
    const result = await runWorkflow('security-scan', { code });

    const vulns = result.finalState['vulnerabilities'] as string[];
    expect(vulns.some((v) => v.includes('CWE-319'))).toBe(true);
  });

  it('executes 3 nodes (scan_imports → check_patterns → report)', async () => {
    const result = await runWorkflow('security-scan', { code: cleanCode });
    expect(result.nodeResults.length).toBe(3);
  });

  it('severity aggregates across both scan phases', async () => {
    const code = 'eval("x"); const password = "pw";\n';
    const result = await runWorkflow('security-scan', { code });

    // eval=5 from scan_imports + password=5 from check_patterns = 10
    expect(Number(result.finalState['severity'])).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// Existing Workflows (Regression)
// ============================================================================

describe('echo workflow (regression)', () => {
  it('still produces echo output', async () => {
    const result = await runWorkflow('echo', { input: 'hello' });
    expect(result.finalState['output']).toBe('echo: hello');
  });
});

describe('pipeline workflow (regression)', () => {
  it('still produces pipeline output', async () => {
    const result = await runWorkflow('pipeline', { input: 'data' });
    expect(result.finalState['output']).toBe('done: data');
    const steps = result.finalState['steps'] as string[];
    expect(steps).toHaveLength(2);
  });
});
