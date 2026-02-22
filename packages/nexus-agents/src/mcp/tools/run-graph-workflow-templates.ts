/**
 * nexus-agents/mcp - Predefined Graph Workflow Templates
 *
 * Registry of graph workflow factories for the run_graph_workflow tool.
 * Each factory builds a CompiledGraph using the GraphBuilder API.
 *
 * Available workflows:
 * - echo: Simple input echo (demo)
 * - pipeline: Two-step validate-process pipeline (demo)
 * - code-review: Complexity-based code review with conditional routing
 * - security-scan: Multi-step security analysis with severity routing
 *
 * @module mcp/tools/run-graph-workflow-templates
 * (Source: Issue #841 — Real-world graph workflow templates)
 */

import { GraphBuilder, overwrite, append, START, END } from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphState } from '../../orchestration/graph/index.js';
import {
  getMultiCliTemplates,
  getMultiCliRegistry,
} from './run-graph-workflow-multicli-templates.js';
import {
  SECURITY_SETUP_TEMPLATES,
  getSecuritySetupRegistry,
} from './run-graph-workflow-security-setup.js';

// ============================================================================
// Registry
// ============================================================================

type GraphFactory = () => CompiledGraph | undefined;

export interface GraphWorkflowInfo {
  readonly name: string;
  readonly description: string;
  readonly inputFields: readonly string[];
  readonly nodeCount: number;
  readonly hasConditionalEdges: boolean;
}

const WORKFLOW_METADATA: readonly GraphWorkflowInfo[] = [
  {
    name: 'echo',
    description: 'Simple input echo (demo). Returns the input prefixed with "echo: ".',
    inputFields: ['input'],
    nodeCount: 1,
    hasConditionalEdges: false,
  },
  {
    name: 'pipeline',
    description: 'Two-step validate-process pipeline (demo). Validates then processes input data.',
    inputFields: ['input'],
    nodeCount: 2,
    hasConditionalEdges: false,
  },
  {
    name: 'code-review',
    description:
      'Complexity-based code review. Routes through deep or quick review based on complexity score.',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: true,
  },
  {
    name: 'security-scan',
    description:
      'Multi-step security analysis. Scans imports and patterns, routes to critical or standard report.',
    inputFields: ['code'],
    nodeCount: 4,
    hasConditionalEdges: true,
  },
];

/** Returns metadata about all available graph workflows (built-in + multi-CLI + security setup). */
export function getGraphWorkflowList(): readonly GraphWorkflowInfo[] {
  return [
    ...WORKFLOW_METADATA,
    ...getMultiCliTemplates().map((t) => t.metadata),
    ...SECURITY_SETUP_TEMPLATES,
  ];
}

/** Registry of all predefined graph workflows (built-in + multi-CLI + security setup). */
export function getGraphRegistry(): ReadonlyMap<string, GraphFactory> {
  return new Map<string, GraphFactory>([
    ['echo', createEchoGraph],
    ['pipeline', createPipelineGraph],
    ['code-review', createCodeReviewGraph],
    ['security-scan', createSecurityScanGraph],
    ...getMultiCliRegistry(),
    ...getSecuritySetupRegistry(),
  ]);
}

// ============================================================================
// Demo: Echo
// ============================================================================

function createEchoGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('output', overwrite(''))
    .addNode('echo', (state) => Promise.resolve({ output: `echo: ${String(state['input'])}` }))
    .addEdge(START, 'echo')
    .addEdge('echo', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Demo: Pipeline
// ============================================================================

function createPipelineGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('input', overwrite(''))
    .addState('steps', append<string>())
    .addState('output', overwrite(''))
    .addNode('validate', (state) =>
      Promise.resolve({ steps: [`validated: ${String(state['input'])}`] })
    )
    .addNode('process', (state) => {
      const steps = state['steps'] as string[];
      return Promise.resolve({
        steps: [`processed ${String(steps.length)} inputs`],
        output: `done: ${String(state['input'])}`,
      });
    })
    .addEdge(START, 'validate')
    .addEdge('validate', 'process')
    .addEdge('process', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Real-World: Code Review
// ============================================================================

const COMPLEXITY_THRESHOLD = 50;

/** Deterministic complexity score from code input. */
function computeComplexity(code: string): number {
  let score = 0;
  const lines = code.split('\n');
  score += Math.min(lines.length, 100);
  score += (code.match(/if\s*\(/g) ?? []).length * 5;
  score += (code.match(/for\s*\(/g) ?? []).length * 5;
  score += (code.match(/while\s*\(/g) ?? []).length * 5;
  score += (code.match(/catch\s*\(/g) ?? []).length * 3;
  score += (code.match(/\?\s*\./g) ?? []).length * 2;
  return score;
}

function createCodeReviewGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('code', overwrite(''))
    .addState('complexity', overwrite(0))
    .addState('findings', append<string>())
    .addState('summary', overwrite(''))
    .addNode('analyze_complexity', analyzeComplexityHandler)
    .addNode('deep_review', deepReviewHandler)
    .addNode('quick_review', quickReviewHandler)
    .addNode('summarize', summarizeReviewHandler)
    .addEdge(START, 'analyze_complexity')
    .addConditionalEdge('analyze_complexity', complexityRouter, ['deep_review', 'quick_review'])
    .addEdge('deep_review', 'summarize')
    .addEdge('quick_review', 'summarize')
    .addEdge('summarize', END)
    .compile();
  return result.ok ? result.value : undefined;
}

function analyzeComplexityHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const score = computeComplexity(code);
  const finding = `Complexity score: ${String(score)} (threshold: ${String(COMPLEXITY_THRESHOLD)})`;
  return Promise.resolve({ complexity: score, findings: [finding] });
}

function complexityRouter(state: Readonly<GraphState>): string {
  const score = Number(state['complexity']);
  return score >= COMPLEXITY_THRESHOLD ? 'deep_review' : 'quick_review';
}

function deepReviewHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const findings: string[] = [];
  if (code.includes('eval(')) findings.push('Dangerous eval() usage detected');
  if (code.includes('any')) findings.push('Type safety: avoid using any');
  if ((code.match(/\n/g) ?? []).length > 200) findings.push('File exceeds 200 lines');
  if (findings.length === 0) findings.push('Deep review: no critical issues found');
  return Promise.resolve({ findings });
}

function quickReviewHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const findings: string[] = [];
  if (code.includes('TODO')) findings.push('Contains TODO comments');
  if (code.includes('console.log')) findings.push('Contains console.log statements');
  if (findings.length === 0) findings.push('Quick review: code looks clean');
  return Promise.resolve({ findings });
}

function summarizeReviewHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const findings = state['findings'] as string[];
  const complexity = Number(state['complexity']);
  const level = complexity >= COMPLEXITY_THRESHOLD ? 'deep' : 'quick';
  const summary = `Code review (${level}): ${String(findings.length)} findings. ${findings.join('; ')}`;
  return Promise.resolve({ summary });
}

// ============================================================================
// Real-World: Security Scan
// ============================================================================

const SEVERITY_THRESHOLD = 5;

function createSecurityScanGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('code', overwrite(''))
    .addState('vulnerabilities', append<string>())
    .addState('severity', overwrite(0))
    .addState('report', overwrite(''))
    .addNode('scan_imports', scanImportsHandler)
    .addNode('check_patterns', checkPatternsHandler)
    .addNode('critical_report', criticalReportHandler)
    .addNode('standard_report', standardReportHandler)
    .addEdge(START, 'scan_imports')
    .addEdge('scan_imports', 'check_patterns')
    .addConditionalEdge('check_patterns', severityRouter, ['critical_report', 'standard_report'])
    .addEdge('critical_report', END)
    .addEdge('standard_report', END)
    .compile();
  return result.ok ? result.value : undefined;
}

function scanImportsHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const vulns: string[] = [];
  let severity = 0;
  if (code.includes('child_process')) {
    vulns.push('CWE-78: OS command injection risk');
    severity += 5;
  }
  if (code.includes('eval(')) {
    vulns.push('CWE-95: Eval injection risk');
    severity += 5;
  }
  if (code.includes('innerHTML')) {
    vulns.push('CWE-79: XSS via innerHTML');
    severity += 3;
  }
  if (code.includes('__proto__')) {
    vulns.push('CWE-1321: Prototype pollution');
    severity += 4;
  }
  return Promise.resolve({ vulnerabilities: vulns, severity });
}

/** Pattern rules for check_patterns node. Each rule is [regex, label, severity]. */
const PATTERN_RULES: ReadonlyArray<readonly [RegExp, string, number]> = [
  [/password\s*=\s*['"]/, 'CWE-798: Hardcoded credentials', 5],
  [/http:\/\//, 'CWE-319: Cleartext HTTP transmission', 2],
  [/new RegExp\(/, 'CWE-1333: Potential ReDoS risk', 3],
  // SQL injection (#1137)
  [
    /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b.*\$\{/,
    'CWE-89: SQL injection via string interpolation',
    8,
  ],
  [
    /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b.*\+\s*(?:req|request|params|query|input|args)/,
    'CWE-89: SQL injection via string concatenation',
    8,
  ],
  // Command injection (#1137)
  [/exec\(.*\$\{/, 'CWE-78: Command injection via string interpolation', 8],
  [/spawn\(.*\$\{/, 'CWE-78: Command injection via spawn interpolation', 8],
  // XSS (#1137)
  [/dangerouslySetInnerHTML/, 'CWE-79: XSS via dangerouslySetInnerHTML', 4],
  // Path traversal (#1137)
  [
    /(?:readFile|writeFile|createReadStream)\(.*(?:req|params|query|input)/,
    'CWE-22: Path traversal via user input in file operations',
    6,
  ],
  // Path traversal via env var (#1156)
  [
    /(?:readFile|writeFile|createReadStream|readFileSync|writeFileSync)\(.*process\.env/,
    'CWE-22: Path traversal via environment variable in file operations',
    4,
  ],
  // Secrets in URL query parameters (#1156)
  [
    /(?:fetch|axios|http\.get|request)\(.*\?.*(?:key|token|secret|password|apiKey|api_key)=/,
    'CWE-598: Sensitive data in URL query string',
    5,
  ],
  [
    /\$\{.*(?:key|token|secret|password|apiKey|api_key).*\}/,
    'CWE-598: Potential secret interpolated into string',
    3,
  ],
] as const;

function checkPatternsHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const code = String(state['code']);
  const vulns: string[] = [];
  let addedSeverity = 0;
  for (const [pattern, label, severity] of PATTERN_RULES) {
    if (pattern.test(code)) {
      vulns.push(label);
      addedSeverity += severity;
    }
  }
  // Special case: JSON.parse without try needs two checks (not a simple regex match)
  if (code.includes('JSON.parse(') && !code.includes('try')) {
    vulns.push('CWE-20: Unvalidated JSON.parse');
    addedSeverity += 2;
  }
  const currentSeverity = Number(state['severity']);
  return Promise.resolve({ vulnerabilities: vulns, severity: currentSeverity + addedSeverity });
}

function severityRouter(state: Readonly<GraphState>): string {
  const severity = Number(state['severity']);
  return severity >= SEVERITY_THRESHOLD ? 'critical_report' : 'standard_report';
}

function criticalReportHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const vulns = state['vulnerabilities'] as string[];
  const severity = Number(state['severity']);
  const findings = vulns.length > 0 ? vulns.join('; ') : 'No vulnerabilities detected';
  const report =
    `CRITICAL: ${String(vulns.length)} vulnerabilities found (severity: ${String(severity)}). ` +
    `Findings: ${findings}. Immediate remediation required.`;
  return Promise.resolve({ report });
}

function standardReportHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const vulns = state['vulnerabilities'] as string[];
  const severity = Number(state['severity']);
  const findings = vulns.length > 0 ? vulns.join('; ') : 'No vulnerabilities detected';
  const report =
    vulns.length === 0
      ? 'PASS: No vulnerabilities detected.'
      : `PASS: ${String(vulns.length)} findings (severity: ${String(severity)}). ` +
        `Details: ${findings}. No critical issues.`;
  return Promise.resolve({ report });
}
