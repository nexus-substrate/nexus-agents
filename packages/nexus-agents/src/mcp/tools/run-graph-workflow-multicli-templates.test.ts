/**
 * Tests for the heuristic ("multi-CLI") graph workflow templates.
 *
 * (Source: Issue #866 - Specialized multi-CLI graph workflow pipelines)
 */

import { describe, it, expect } from 'vitest';
import {
  getMultiCliTemplates,
  getMultiCliRegistry,
  SECURITY_AUDIT_ASSIGNMENTS,
  TEST_GENERATION_ASSIGNMENTS,
  DOCUMENTATION_ASSIGNMENTS,
} from './run-graph-workflow-multicli-templates.js';
import { getGraphRegistry, getGraphWorkflowList } from './run-graph-workflow-templates.js';
import { executeGraph } from '../../orchestration/graph/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getGraph(name: string) {
  const registry = getMultiCliRegistry();
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
// Registration
// ============================================================================

describe('multi-CLI template registration', () => {
  it('provides 3 templates', () => {
    expect(getMultiCliTemplates()).toHaveLength(3);
  });

  it('all factories compile successfully', () => {
    for (const [name, factory] of getMultiCliRegistry()) {
      expect(factory(), `${name} failed to compile`).toBeDefined();
    }
  });

  it('templates are integrated into main registry', () => {
    const mainRegistry = getGraphRegistry();
    expect(mainRegistry.has('security-audit')).toBe(true);
    expect(mainRegistry.has('test-generation')).toBe(true);
    expect(mainRegistry.has('documentation')).toBe(true);
  });

  it('templates appear in workflow list', () => {
    const list = getGraphWorkflowList();
    const names = list.map((w) => w.name);
    expect(names).toContain('security-audit');
    expect(names).toContain('test-generation');
    expect(names).toContain('documentation');
  });

  it('each template annotates an intended owner for all nodes', () => {
    for (const t of getMultiCliTemplates()) {
      expect(t.cliAssignments.length).toBe(t.metadata.nodeCount);
    }
  });
});

// ============================================================================
// Step-label honesty guard (#6676)
// ============================================================================

/**
 * A step label names a model family or CLI only when that node actually
 * invoked an adapter. No node in these templates invokes one — every handler
 * is a local keyword/regex check — so no step may name a family or CLI.
 */
const MODEL_OR_CLI_NAME =
  /\b(claude|codex|gemini|opencode|openrouter|gpt|opus|sonnet|haiku|anthropic|openai)\b/i;

function inputsFor(fields: readonly string[]): Record<string, unknown> {
  const sample = 'export function run(x) { exec(x); eval(x); throw new Error("e"); }';
  return Object.fromEntries(fields.map((f) => [f, f === 'topic' ? 'Topic' : sample]));
}

describe('step labels do not claim a model ran (#6676)', () => {
  const templates = getMultiCliTemplates();

  it('covers a non-empty template set', () => {
    // Empty case named: a guard over zero templates would pass vacuously.
    expect(templates.length).toBeGreaterThan(0);
  });

  for (const t of templates) {
    it(`${t.metadata.name}: no step names a model family or CLI`, async () => {
      const result = await runWorkflow(t.metadata.name, inputsFor(t.metadata.inputFields));
      const steps = result.finalState['steps'] as string[];
      expect(steps).toHaveLength(t.metadata.nodeCount);
      for (const step of steps) {
        expect(step, `step "${step}" names a model/CLI`).not.toMatch(MODEL_OR_CLI_NAME);
        expect(step).toMatch(/^\[heuristic\] /);
      }
    });

    it(`${t.metadata.name}: description says it calls no model`, () => {
      expect(t.metadata.description).not.toMatch(MODEL_OR_CLI_NAME);
      expect(t.metadata.description).toContain('calls no model');
    });
  }
});

// ============================================================================
// Security Audit Pipeline
// ============================================================================

describe('security-audit workflow', () => {
  const cleanCode = 'const x = 1;\nconst y = 2;\n';
  const dangerousCode = [
    'exec("rm -rf /")',
    'const html = `<div>${innerHTML}</div>`',
    'const password = "secret"',
    'fetch("http://api.example.com")',
  ].join('\n');

  it('runs 4 nodes in sequence', async () => {
    const result = await runWorkflow('security-audit', { code: cleanCode });
    expect(result.nodeResults).toHaveLength(4);
  });

  it('labels every step as a heuristic check', async () => {
    const result = await runWorkflow('security-audit', { code: cleanCode });
    const steps = result.finalState['steps'] as string[];
    expect(steps).toHaveLength(4);
    expect(steps[0]).toMatch(/^\[heuristic\] /);
    expect(steps[1]).toMatch(/^\[heuristic\] /);
    expect(steps[2]).toMatch(/^\[heuristic\] /);
    expect(steps[3]).toMatch(/^\[heuristic\] /);
  });

  it('detects threat surfaces in dangerous code', async () => {
    const result = await runWorkflow('security-audit', { code: dangerousCode });
    const tm = String(result.finalState['threat_model']);
    expect(tm).toContain('Command injection');
  });

  it('detects code vulnerabilities', async () => {
    const result = await runWorkflow('security-audit', { code: dangerousCode });
    const ca = String(result.finalState['code_analysis']);
    expect(ca).toContain('Hardcoded credentials');
  });

  it('generates synthesized report', async () => {
    const result = await runWorkflow('security-audit', { code: dangerousCode });
    const report = String(result.finalState['report']);
    expect(report).toContain('Security Audit Report');
    expect(report).toContain('Threat model');
    expect(report).toContain('Code analysis');
    expect(report).toContain('Doc review');
  });
});

// ============================================================================
// Test Generation Pipeline
// ============================================================================

describe('test-generation workflow', () => {
  const code = [
    'function add(a, b) { return a + b; }',
    'function multiply(a, b) { throw new Error("todo"); }',
  ].join('\n');

  it('runs 4 nodes in sequence', async () => {
    const result = await runWorkflow('test-generation', { code });
    expect(result.nodeResults).toHaveLength(4);
  });

  it('labels every step as a heuristic check', async () => {
    const result = await runWorkflow('test-generation', { code });
    const steps = result.finalState['steps'] as string[];
    expect(steps[0]).toMatch(/^\[heuristic\] /);
    expect(steps[1]).toMatch(/^\[heuristic\] /);
    expect(steps[2]).toMatch(/^\[heuristic\] /);
    expect(steps[3]).toMatch(/^\[heuristic\] /);
  });

  it('generates tests for each function', async () => {
    const result = await runWorkflow('test-generation', { code });
    const tests = String(result.finalState['tests']);
    expect(tests).toContain('add');
    expect(tests).toContain('multiply');
  });

  it('identifies coverage gaps', async () => {
    const result = await runWorkflow('test-generation', { code });
    const review = String(result.finalState['review']);
    expect(review).toContain('Missing error case tests');
  });

  it('generates final report', async () => {
    const result = await runWorkflow('test-generation', { code });
    const report = String(result.finalState['report']);
    expect(report).toContain('Test Generation Report');
  });
});

// ============================================================================
// Documentation Pipeline
// ============================================================================

describe('documentation workflow', () => {
  const code = [
    'export function greet(name) { return `Hello ${name}`; }',
    'import { z } from "zod";',
  ].join('\n');

  it('runs 4 nodes in sequence', async () => {
    const result = await runWorkflow('documentation', { topic: 'Greeting', code });
    expect(result.nodeResults).toHaveLength(4);
  });

  it('labels every step as a heuristic check', async () => {
    const result = await runWorkflow('documentation', { topic: 'Test', code });
    const steps = result.finalState['steps'] as string[];
    expect(steps[0]).toMatch(/^\[heuristic\] /);
    expect(steps[1]).toMatch(/^\[heuristic\] /);
    expect(steps[2]).toMatch(/^\[heuristic\] /);
    expect(steps[3]).toMatch(/^\[heuristic\] /);
  });

  it('extracts exports and dependencies', async () => {
    const result = await runWorkflow('documentation', { topic: 'Test', code });
    const research = String(result.finalState['research']);
    expect(research).toContain('export function greet');
    expect(research).toContain('Dependencies');
  });

  it('generates structured documentation', async () => {
    const result = await runWorkflow('documentation', { topic: 'Greeting', code });
    const content = String(result.finalState['content']);
    expect(content).toContain('# Greeting');
    expect(content).toContain('## Overview');
  });

  it('generates code examples', async () => {
    const result = await runWorkflow('documentation', { topic: 'Test', code });
    const examples = String(result.finalState['examples']);
    expect(examples).toContain('greet');
  });

  it('assembles final output with examples section', async () => {
    const result = await runWorkflow('documentation', { topic: 'Test', code });
    const output = String(result.finalState['output']);
    expect(output).toContain('## Code Examples');
  });
});

// ============================================================================
// Intended-owner annotations (design intent, not executors — #6676)
// ============================================================================

describe('intended-owner annotation constants', () => {
  it('security-audit uses all three CLIs', () => {
    const clis = new Set(SECURITY_AUDIT_ASSIGNMENTS.map((a) => a.preferredCli));
    expect(clis).toEqual(new Set(['claude', 'codex', 'gemini']));
  });

  it('test-generation uses all three CLIs', () => {
    const clis = new Set(TEST_GENERATION_ASSIGNMENTS.map((a) => a.preferredCli));
    expect(clis).toEqual(new Set(['codex', 'claude', 'gemini']));
  });

  it('documentation uses all three CLIs', () => {
    const clis = new Set(DOCUMENTATION_ASSIGNMENTS.map((a) => a.preferredCli));
    expect(clis).toEqual(new Set(['gemini', 'claude', 'codex']));
  });
});
