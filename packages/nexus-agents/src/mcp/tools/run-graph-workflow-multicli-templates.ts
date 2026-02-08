/**
 * nexus-agents/mcp - Multi-CLI Graph Workflow Templates
 *
 * Specialized pipelines that assign each graph node to a preferred CLI
 * based on model strengths:
 * - security-audit: Claude (threats) -> Codex (code) -> Gemini (docs)
 * - test-generation: Codex (tests) -> Claude (review) -> Gemini (edge cases)
 * - documentation: Gemini (research) -> Claude (write) -> Codex (examples)
 *
 * @module mcp/tools/run-graph-workflow-multicli-templates
 * (Source: Issue #866 - Specialized multi-CLI graph workflow pipelines)
 */

import { GraphBuilder, overwrite, append, START, END } from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphState } from '../../orchestration/graph/index.js';
import type { GraphWorkflowInfo } from './run-graph-workflow-templates.js';

// ============================================================================
// Types
// ============================================================================

type GraphFactory = () => CompiledGraph | undefined;

/** CLI assignment for a single graph node. */
export interface CliAssignment {
  readonly node: string;
  readonly preferredCli: 'claude' | 'codex' | 'gemini';
}

/** Multi-CLI template with workflow metadata and CLI routing assignments. */
export interface MultiCliTemplate {
  readonly factory: GraphFactory;
  readonly metadata: GraphWorkflowInfo;
  readonly cliAssignments: readonly CliAssignment[];
}

// ============================================================================
// CLI Routing Assignments
// ============================================================================

export const SECURITY_AUDIT_ASSIGNMENTS: readonly CliAssignment[] = [
  { node: 'threat_model', preferredCli: 'claude' },
  { node: 'code_analysis', preferredCli: 'codex' },
  { node: 'doc_review', preferredCli: 'gemini' },
  { node: 'synthesize', preferredCli: 'claude' },
];

export const TEST_GENERATION_ASSIGNMENTS: readonly CliAssignment[] = [
  { node: 'generate_tests', preferredCli: 'codex' },
  { node: 'review_coverage', preferredCli: 'claude' },
  { node: 'research_edge_cases', preferredCli: 'gemini' },
  { node: 'compile_report', preferredCli: 'claude' },
];

export const DOCUMENTATION_ASSIGNMENTS: readonly CliAssignment[] = [
  { node: 'research_gather', preferredCli: 'gemini' },
  { node: 'write_structure', preferredCli: 'claude' },
  { node: 'code_examples', preferredCli: 'codex' },
  { node: 'assemble', preferredCli: 'claude' },
];

// ============================================================================
// Security Audit — Claude -> Codex -> Gemini -> synthesis
// ============================================================================

function threatModelHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const threats: string[] = [];
  if (code.includes('exec(') || code.includes('spawn(')) threats.push('Command injection surface');
  if (code.includes('req.body') || code.includes('req.query'))
    threats.push('Unvalidated user input');
  if (code.includes('fs.readFile') || code.includes('fs.writeFile'))
    threats.push('File system access');
  if (code.includes('query(') || code.includes('SQL')) threats.push('SQL injection surface');
  if (threats.length === 0) threats.push('No significant threat surfaces');
  return Promise.resolve({
    threat_model: `Threat model: ${threats.join('; ')}`,
    steps: [`[claude] Threat modeling: ${String(threats.length)} surfaces identified`],
  });
}

function codeAnalysisHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const findings: string[] = [];
  if (code.includes('eval(')) findings.push('eval() usage');
  if (code.includes('innerHTML')) findings.push('innerHTML XSS risk');
  if (/password\s*=\s*['"]/.test(code)) findings.push('Hardcoded credentials');
  if (code.includes('__proto__')) findings.push('Prototype pollution');
  if (code.includes('http://')) findings.push('Cleartext HTTP');
  if (findings.length === 0) findings.push('No static analysis issues');
  return Promise.resolve({
    code_analysis: `Code analysis: ${findings.join('; ')}`,
    steps: [`[codex] Static analysis: ${String(findings.length)} findings`],
  });
}

function docReviewHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const gaps: string[] = [];
  if (!code.includes('@security')) gaps.push('Missing security documentation');
  if (!code.includes('@throws') && code.includes('throw')) gaps.push('Undocumented exceptions');
  if (!code.includes('@param') && code.includes('function')) gaps.push('Missing parameter docs');
  if (gaps.length === 0) gaps.push('Documentation adequate');
  return Promise.resolve({
    doc_review: `Doc review: ${gaps.join('; ')}`,
    steps: [`[gemini] Documentation review: ${String(gaps.length)} gaps found`],
  });
}

function synthesizeAuditHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const tm = String(state['threat_model']);
  const ca = String(state['code_analysis']);
  const dr = String(state['doc_review']);
  const report = `Security Audit Report\n---\n${tm}\n${ca}\n${dr}`;
  return Promise.resolve({ report, steps: ['[claude] Synthesized audit report'] });
}

function createSecurityAuditGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('code', overwrite(''))
    .addState('threat_model', overwrite(''))
    .addState('code_analysis', overwrite(''))
    .addState('doc_review', overwrite(''))
    .addState('report', overwrite(''))
    .addState('steps', append<string>())
    .addNode('threat_model', threatModelHandler)
    .addNode('code_analysis', codeAnalysisHandler)
    .addNode('doc_review', docReviewHandler)
    .addNode('synthesize', synthesizeAuditHandler)
    .addEdge(START, 'threat_model')
    .addEdge('threat_model', 'code_analysis')
    .addEdge('code_analysis', 'doc_review')
    .addEdge('doc_review', 'synthesize')
    .addEdge('synthesize', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Test Generation — Codex -> Claude -> Gemini -> compilation
// ============================================================================

function generateTestsHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const tests: string[] = [];
  const fnMatches = code.match(/function\s+(\w+)/g) ?? [];
  for (const fn of fnMatches) {
    const name = fn.replace('function ', '');
    tests.push(`describe('${name}', () => { it('works', () => { expect(true); }); });`);
  }
  if (tests.length === 0) tests.push('// No functions found to test');
  return Promise.resolve({
    tests: tests.join('\n'),
    steps: [`[codex] Generated ${String(tests.length)} test(s)`],
  });
}

function reviewCoverageHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const tests = String(state['tests']);
  const gaps: string[] = [];
  if (code.includes('throw') && !tests.includes('toThrow')) gaps.push('Missing error case tests');
  if (code.includes('if ') && !tests.includes('edge')) gaps.push('Missing branch coverage');
  if (code.includes('async') && !tests.includes('await')) gaps.push('Missing async test coverage');
  if (gaps.length === 0) gaps.push('Coverage appears adequate');
  return Promise.resolve({
    review: `Coverage review: ${gaps.join('; ')}`,
    steps: [`[claude] Coverage review: ${String(gaps.length)} gap(s)`],
  });
}

function researchEdgeCasesHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const edges: string[] = [];
  if (code.includes('parseInt') || code.includes('Number(')) edges.push('NaN/Infinity edge cases');
  if (code.includes('[]') || code.includes('Array')) edges.push('Empty array boundary');
  if (code.includes('string') || code.includes('String')) edges.push('Empty/unicode string edges');
  if (edges.length === 0) edges.push('No obvious edge cases');
  return Promise.resolve({
    edge_cases: `Edge cases: ${edges.join('; ')}`,
    steps: [`[gemini] Researched ${String(edges.length)} edge case(s)`],
  });
}

function compileTestReportHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const tests = String(state['tests']);
  const review = String(state['review']);
  const edgeCases = String(state['edge_cases']);
  const report = `Test Generation Report\n---\n${tests}\n${review}\n${edgeCases}`;
  return Promise.resolve({ report, steps: ['[claude] Compiled test report'] });
}

function createTestGenerationGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('code', overwrite(''))
    .addState('tests', overwrite(''))
    .addState('review', overwrite(''))
    .addState('edge_cases', overwrite(''))
    .addState('report', overwrite(''))
    .addState('steps', append<string>())
    .addNode('generate_tests', generateTestsHandler)
    .addNode('review_coverage', reviewCoverageHandler)
    .addNode('research_edge_cases', researchEdgeCasesHandler)
    .addNode('compile_report', compileTestReportHandler)
    .addEdge(START, 'generate_tests')
    .addEdge('generate_tests', 'review_coverage')
    .addEdge('review_coverage', 'research_edge_cases')
    .addEdge('research_edge_cases', 'compile_report')
    .addEdge('compile_report', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Documentation — Gemini -> Claude -> Codex -> assembly
// ============================================================================

function researchGatherHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const topic = String(state['topic']);
  const code = String(state['code']);
  const research: string[] = [`Topic: ${topic}`];
  const exports = code.match(/export\s+(function|const|class)\s+(\w+)/g) ?? [];
  if (exports.length > 0) research.push(`Exports: ${exports.join(', ')}`);
  const imports = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) ?? [];
  if (imports.length > 0) research.push(`Dependencies: ${String(imports.length)} imports`);
  return Promise.resolve({
    research: research.join('; '),
    steps: [`[gemini] Gathered research on "${topic}"`],
  });
}

function writeStructureHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const topic = String(state['topic']);
  const research = String(state['research']);
  const sections = [
    `# ${topic}`,
    `## Overview\n${research}`,
    '## API Reference\n(Generated from exports)',
    '## Usage\n(See code examples below)',
  ];
  return Promise.resolve({
    content: sections.join('\n\n'),
    steps: [`[claude] Structured documentation for "${topic}"`],
  });
}

function codeExamplesHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const examples: string[] = [];
  const fnMatches = code.match(/export\s+function\s+(\w+)/g) ?? [];
  for (const fn of fnMatches) {
    const name = fn.replace('export function ', '');
    examples.push(`\`\`\`typescript\nconst result = ${name}();\n\`\`\``);
  }
  if (examples.length === 0) examples.push('```typescript\n// No exported functions found\n```');
  return Promise.resolve({
    examples: examples.join('\n\n'),
    steps: [`[codex] Generated ${String(examples.length)} code example(s)`],
  });
}

function assembleDocHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const content = String(state['content']);
  const examples = String(state['examples']);
  const output = `${content}\n\n## Code Examples\n\n${examples}`;
  return Promise.resolve({ output, steps: ['[claude] Assembled final documentation'] });
}

function createDocumentationGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('topic', overwrite(''))
    .addState('code', overwrite(''))
    .addState('research', overwrite(''))
    .addState('content', overwrite(''))
    .addState('examples', overwrite(''))
    .addState('output', overwrite(''))
    .addState('steps', append<string>())
    .addNode('research_gather', researchGatherHandler)
    .addNode('write_structure', writeStructureHandler)
    .addNode('code_examples', codeExamplesHandler)
    .addNode('assemble', assembleDocHandler)
    .addEdge(START, 'research_gather')
    .addEdge('research_gather', 'write_structure')
    .addEdge('write_structure', 'code_examples')
    .addEdge('code_examples', 'assemble')
    .addEdge('assemble', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Registration
// ============================================================================

/** Returns all multi-CLI graph workflow templates with CLI assignments. */
export function getMultiCliTemplates(): readonly MultiCliTemplate[] {
  return [
    {
      factory: createSecurityAuditGraph,
      metadata: {
        name: 'security-audit',
        description:
          'Multi-CLI security audit: Claude (threats) -> Codex (code) -> Gemini (docs) -> synthesis',
        inputFields: ['code'],
        nodeCount: 4,
        hasConditionalEdges: false,
      },
      cliAssignments: SECURITY_AUDIT_ASSIGNMENTS,
    },
    {
      factory: createTestGenerationGraph,
      metadata: {
        name: 'test-generation',
        description:
          'Multi-CLI test gen: Codex (tests) -> Claude (review) -> Gemini (edges) -> report',
        inputFields: ['code'],
        nodeCount: 4,
        hasConditionalEdges: false,
      },
      cliAssignments: TEST_GENERATION_ASSIGNMENTS,
    },
    {
      factory: createDocumentationGraph,
      metadata: {
        name: 'documentation',
        description:
          'Multi-CLI docs: Gemini (research) -> Claude (write) -> Codex (examples) -> assemble',
        inputFields: ['topic', 'code'],
        nodeCount: 4,
        hasConditionalEdges: false,
      },
      cliAssignments: DOCUMENTATION_ASSIGNMENTS,
    },
  ];
}

/** Returns graph factories for multi-CLI templates, keyed by name. */
export function getMultiCliRegistry(): ReadonlyMap<string, GraphFactory> {
  const templates = getMultiCliTemplates();
  return new Map(templates.map((t) => [t.metadata.name, t.factory]));
}
