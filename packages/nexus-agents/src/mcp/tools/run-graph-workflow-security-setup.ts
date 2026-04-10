/**
 * nexus-agents/mcp - Security Scan Setup Graph Workflow Templates
 *
 * Three independent pipeline templates for setting up security scanning CI:
 * - security-setup-semgrep: SAST via Semgrep (language-aware rule selection)
 * - security-setup-zap: DAST via ZAP (target URL baseline scanning)
 * - security-setup-grype: SCA/container scanning via Grype
 *
 * Each template is independently invocable so projects import only the
 * scanners relevant to their stack and threat model.
 *
 * @module mcp/tools/run-graph-workflow-security-setup
 * (Source: Issue #1075 — Security Scan Setup graph workflow templates)
 */

/* eslint-disable max-lines */
import { GraphBuilder, overwrite, START, END } from '../../orchestration/graph/index.js';
import type { CompiledGraph, GraphState } from '../../orchestration/graph/index.js';
import type { GraphWorkflowInfo } from './run-graph-workflow-templates.js';

// ============================================================================
// Shared Constants & Helpers
// ============================================================================

const VALID_STACKS = [
  'node',
  'python',
  'go',
  'java',
  'ruby',
  'rust',
  'cpp',
  'kotlin',
  'swift',
  'php',
  'shell',
  'hcl',
  'sql',
  'yaml',
  'generic',
];

/** Map stacks to Semgrep rule packs. Canonical source: secure-language-stacks. */
const SEMGREP_RULESETS: Record<string, string> = {
  node: 'p/javascript p/typescript p/nodejs',
  python: 'p/python p/django p/flask',
  go: 'p/golang',
  java: 'p/java',
  ruby: 'p/ruby',
  rust: 'p/rust',
  cpp: 'p/c',
  kotlin: 'p/kotlin',
  swift: 'p/swift',
  php: 'p/php',
  shell: 'p/bash',
  hcl: 'p/terraform',
  sql: 'p/sql-injection',
  yaml: 'p/kubernetes',
  generic: 'p/default',
};

/** Alias map for common language names → canonical stack keys. */
const STACK_ALIASES: Record<string, string> = {
  typescript: 'node',
  javascript: 'node',
  nodejs: 'node',
  'c++': 'cpp',
  c: 'cpp',
  terraform: 'hcl',
  opentofu: 'hcl',
  bash: 'shell',
  zsh: 'shell',
  kubernetes: 'yaml',
  k8s: 'yaml',
  postgresql: 'sql',
  mysql: 'sql',
};

/** Safely convert an unknown value to string without `as` cast. */
function toStr(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

/** Normalize a raw stack string to a known stack or 'generic'. */
function normalizeStack(raw: unknown): string {
  if (raw === undefined || raw === null) {
    return 'generic';
  }
  const stack = toStr(raw).trim().toLowerCase();
  if (VALID_STACKS.includes(stack)) return stack;
  const aliased = STACK_ALIASES[stack];
  if (aliased !== undefined) return aliased;
  return 'generic';
}

/** CI workflow YAML header shared across all templates. */
function ciHeader(workflowName: string): string {
  return [
    `name: ${workflowName}`,
    '',
    'on:',
    '  push:',
    '    branches: [main]',
    '  pull_request:',
    '    branches: [main]',
    '  schedule:',
    "    - cron: '0 6 * * 1'",
    '',
    'permissions:',
    '  contents: read',
    '  security-events: write',
    '',
    'jobs:',
  ].join('\n');
}

/** Basic structural validation for generated CI YAML. */
function validateCiConfig(config: string): string[] {
  const errors: string[] = [];
  if (!config.includes('name:')) errors.push('Missing workflow name');
  if (!config.includes('on:')) errors.push('Missing trigger definition');
  if (!config.includes('jobs:')) errors.push('Missing jobs section');
  return errors;
}

/** Build final output from CI config + optional scanner config. */
function buildOutput(ciConfig: string, scannerConfig: string, errors: string[]): string {
  const sections = ['## CI Workflow', '', ciConfig];
  if (scannerConfig.length > 0) {
    sections.push('', '## Scanner Configuration', '', scannerConfig);
  }
  if (errors.length > 0) {
    sections.push('', '## Validation Errors', ...errors.map((e) => `- ${e}`));
  }
  return sections.join('\n');
}

// ============================================================================
// Metadata
// ============================================================================

export const SEMGREP_SETUP_METADATA: GraphWorkflowInfo = {
  name: 'security-setup-semgrep',
  description:
    'SAST pipeline: generates GitHub Actions workflow + Semgrep rule config. ' +
    'Auto-selects rule packs based on detected language stack.',
  inputFields: ['stack'],
  nodeCount: 3,
  hasConditionalEdges: false,
};

export const ZAP_SETUP_METADATA: GraphWorkflowInfo = {
  name: 'security-setup-zap',
  description:
    'DAST pipeline: generates GitHub Actions workflow + ZAP automation plan. ' +
    'Configures baseline scan against a target URL.',
  inputFields: ['targetUrl', 'failThreshold'],
  nodeCount: 3,
  hasConditionalEdges: false,
};

export const GRYPE_SETUP_METADATA: GraphWorkflowInfo = {
  name: 'security-setup-grype',
  description:
    'SCA pipeline: generates GitHub Actions workflow for Grype filesystem ' +
    'and container image scanning. Detects stack for package-manager targeting.',
  inputFields: ['stack', 'scanType'],
  nodeCount: 3,
  hasConditionalEdges: false,
};

export const SECURITY_SETUP_TEMPLATES: readonly GraphWorkflowInfo[] = [
  SEMGREP_SETUP_METADATA,
  ZAP_SETUP_METADATA,
  GRYPE_SETUP_METADATA,
];

// ============================================================================
// Semgrep Setup — SAST Pipeline
// ============================================================================

/** Detect language stack for Semgrep rule selection. */
export function semgrepDetectStackHandler(
  state: Readonly<GraphState>
): Promise<Partial<GraphState>> {
  const detected = normalizeStack(state['stack']);
  const rulesets = SEMGREP_RULESETS[detected] ?? 'p/default';
  return Promise.resolve({ detectedStack: detected, rulesets });
}

/** Generate GitHub Actions workflow + Semgrep config. */
export function semgrepGenerateConfigHandler(
  state: Readonly<GraphState>
): Promise<Partial<GraphState>> {
  const rawRulesets = state['rulesets'];
  let rulesets = 'p/default';
  if (rawRulesets !== undefined && rawRulesets !== null) {
    rulesets = toStr(rawRulesets);
  }

  const ciConfig =
    ciHeader('Semgrep SAST') +
    '\n' +
    [
      '  semgrep:',
      '    runs-on: ubuntu-latest',
      '    container:',
      '      image: semgrep/semgrep',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Run Semgrep',
      `        run: semgrep scan --config="${rulesets}" --sarif > semgrep.sarif`,
      '      - name: Upload SARIF',
      '        uses: github/codeql-action/upload-sarif@v3',
      '        with:',
      '          sarif_file: semgrep.sarif',
    ].join('\n');

  const scannerConfig = [
    '# .semgrep.yml',
    'rules:',
    `  - id: custom-eval-ban`,
    '    patterns:',
    '      - pattern: eval(...)',
    '    message: >',
    '      Avoid eval() — use safer alternatives.',
    '    severity: ERROR',
    '    languages: [javascript, typescript, python]',
    '',
    `  - id: custom-hardcoded-secret`,
    '    patterns:',
    '      - pattern: $KEY = "..."',
    '      - metavariable-regex:',
    '          metavariable: $KEY',
    '          regex: (password|secret|api_key|token)',
    '    message: >',
    '      Hardcoded secret detected.',
    '    severity: WARNING',
    '    languages: [javascript, typescript, python]',
  ].join('\n');

  return Promise.resolve({ ciConfig, scannerConfig });
}

/** Validate Semgrep pipeline output. */
export function semgrepValidateHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const rawCi = state['ciConfig'];
  let ciConfig = '';
  if (rawCi !== undefined && rawCi !== null) {
    ciConfig = toStr(rawCi);
  }

  const rawScanner = state['scannerConfig'];
  let scannerConfig = '';
  if (rawScanner !== undefined && rawScanner !== null) {
    scannerConfig = toStr(rawScanner);
  }
  const errors = validateCiConfig(ciConfig);
  if (!ciConfig.includes('semgrep')) errors.push('Missing semgrep job');
  if (scannerConfig.length === 0) errors.push('Empty scanner config');
  const output = buildOutput(ciConfig, scannerConfig, errors);
  return Promise.resolve({ validationErrors: errors, output });
}

/** Creates the Semgrep SAST setup graph. */
export function createSemgrepSetupGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('stack', overwrite(''))
    .addState('detectedStack', overwrite(''))
    .addState('rulesets', overwrite(''))
    .addState('ciConfig', overwrite(''))
    .addState('scannerConfig', overwrite(''))
    .addState('validationErrors', overwrite([] as string[]))
    .addState('output', overwrite(''))
    .addNode('detect_stack', semgrepDetectStackHandler)
    .addNode('generate_config', semgrepGenerateConfigHandler)
    .addNode('validate', semgrepValidateHandler)
    .addEdge(START, 'detect_stack')
    .addEdge('detect_stack', 'generate_config')
    .addEdge('generate_config', 'validate')
    .addEdge('validate', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// ZAP Setup — DAST Pipeline
// ============================================================================

const DEFAULT_TARGET_URL = 'http://localhost:3000';

/** Configure ZAP target URL and scan parameters. */
export function zapConfigureTargetHandler(
  state: Readonly<GraphState>
): Promise<Partial<GraphState>> {
  const rawUrl = state['targetUrl'];
  let urlStr = '';
  if (rawUrl !== undefined && rawUrl !== null) {
    urlStr = toStr(rawUrl);
  }
  const targetUrl = urlStr.trim().length > 0 ? urlStr.trim() : DEFAULT_TARGET_URL;

  const rawThreshold = state['failThreshold'];
  let thresholdStr = 'high';
  if (rawThreshold !== undefined && rawThreshold !== null) {
    thresholdStr = toStr(rawThreshold);
  }
  const threshold = thresholdStr.toLowerCase();
  const validThresholds = ['low', 'medium', 'high'];
  const failThreshold = validThresholds.includes(threshold) ? threshold : 'high';
  return Promise.resolve({ resolvedUrl: targetUrl, resolvedThreshold: failThreshold });
}

/** Generate GitHub Actions workflow + ZAP automation plan. */
// eslint-disable-next-line max-lines-per-function
export function zapGenerateConfigHandler(
  state: Readonly<GraphState>
): Promise<Partial<GraphState>> {
  const rawUrl = state['resolvedUrl'];
  let url = DEFAULT_TARGET_URL;
  if (rawUrl !== undefined && rawUrl !== null) {
    url = toStr(rawUrl);
  }

  const rawThreshold = state['resolvedThreshold'];
  let threshold = 'high';
  if (rawThreshold !== undefined && rawThreshold !== null) {
    threshold = toStr(rawThreshold);
  }
  const failAction = threshold === 'low' ? 'true' : 'warn';

  const ciConfig =
    ciHeader('ZAP DAST') +
    '\n' +
    [
      '  zap-scan:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: ZAP Baseline Scan',
      '        uses: zaproxy/action-baseline@v0.12.0',
      '        with:',
      `          target: '${url}'`,
      '          rules_file_name: zap-rules.tsv',
      `          fail_action: ${failAction}`,
      '          cmd_options: -a -j',
      '      - name: Upload Report',
      '        uses: actions/upload-artifact@v4',
      '        if: always()',
      '        with:',
      '          name: zap-report',
      '          path: report_html.html',
    ].join('\n');

  const riskCode = threshold === 'low' ? 1 : threshold === 'medium' ? 2 : 3;
  const scannerConfig = [
    '# zap-automation.yaml',
    'env:',
    '  contexts:',
    '    - name: Default Context',
    `      urls: ["${url}"]`,
    '  parameters:',
    '    failOnError: true',
    `    failOnWarning: ${threshold === 'low' ? 'true' : 'false'}`,
    '    progressToStdout: true',
    'jobs:',
    '  - type: spider',
    '    parameters:',
    '      maxDuration: 5',
    '      maxDepth: 5',
    '  - type: passiveScan-wait',
    '    parameters:',
    '      maxDuration: 10',
    '  - type: activeScan',
    '    parameters:',
    `      maxRuleDurationInMins: 5`,
    `      maxScanDurationInMins: 30`,
    `  - type: report`,
    '    parameters:',
    '      template: traditional-json',
    '      reportDir: /zap/reports',
    `      reportTitle: ZAP Scan (threshold riskCode>=${String(riskCode)})`,
  ].join('\n');

  return Promise.resolve({ ciConfig, scannerConfig });
}

/** Validate ZAP pipeline output. */
export function zapValidateHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const rawCi = state['ciConfig'];
  let ciConfig = '';
  if (rawCi !== undefined && rawCi !== null) {
    ciConfig = toStr(rawCi);
  }

  const rawScanner = state['scannerConfig'];
  let scannerConfig = '';
  if (rawScanner !== undefined && rawScanner !== null) {
    scannerConfig = toStr(rawScanner);
  }
  const errors = validateCiConfig(ciConfig);
  if (!ciConfig.includes('zap')) errors.push('Missing ZAP job');
  if (!scannerConfig.includes('spider')) errors.push('Missing spider config');
  const output = buildOutput(ciConfig, scannerConfig, errors);
  return Promise.resolve({ validationErrors: errors, output });
}

/** Creates the ZAP DAST setup graph. */
export function createZapSetupGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('targetUrl', overwrite(''))
    .addState('failThreshold', overwrite('high'))
    .addState('resolvedUrl', overwrite(''))
    .addState('resolvedThreshold', overwrite(''))
    .addState('ciConfig', overwrite(''))
    .addState('scannerConfig', overwrite(''))
    .addState('validationErrors', overwrite([] as string[]))
    .addState('output', overwrite(''))
    .addNode('configure_target', zapConfigureTargetHandler)
    .addNode('generate_config', zapGenerateConfigHandler)
    .addNode('validate', zapValidateHandler)
    .addEdge(START, 'configure_target')
    .addEdge('configure_target', 'generate_config')
    .addEdge('generate_config', 'validate')
    .addEdge('validate', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Grype Setup — SCA / Container Pipeline
// ============================================================================

const GRYPE_SCAN_TYPES: Record<string, string> = {
  fs: "'fs'",
  image: "'image'",
  repo: "'repo'",
};

/** Detect stack and resolve scan type for Grype. */
export function grypeDetectStackHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const detected = normalizeStack(state['stack']);
  const rawScanType = state['scanType'];
  let scanTypeStr = 'fs';
  if (rawScanType !== undefined && rawScanType !== null) {
    scanTypeStr = toStr(rawScanType);
  }
  const rawType = scanTypeStr.toLowerCase();
  const scanType = rawType in GRYPE_SCAN_TYPES ? rawType : 'fs';
  return Promise.resolve({ detectedStack: detected, resolvedScanType: scanType });
}

/** Generate GitHub Actions workflow for Grype. */
export function grypeGenerateConfigHandler(
  state: Readonly<GraphState>
): Promise<Partial<GraphState>> {
  const rawScanType = state['resolvedScanType'];
  let scanType = 'fs';
  if (rawScanType !== undefined && rawScanType !== null) {
    scanType = toStr(rawScanType);
  }
  const scanTypeYaml = GRYPE_SCAN_TYPES[scanType] ?? "'fs'";

  const ciConfig =
    ciHeader('Grype Security Scan') +
    '\n' +
    [
      '  grype:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Run Grype vulnerability scanner',
      '        uses: anchore/scan-action@v4',
      '        with:',
      `          path: ${scanTypeYaml}`,
      '          severity: CRITICAL,HIGH',
      "          output: 'grype-results.sarif'",
      '      - name: Upload SARIF',
      '        uses: github/codeql-action/upload-sarif@v3',
      '        with:',
      '          sarif_file: grype-results.sarif',
    ].join('\n');

  const scannerConfig = [
    '# grype.yaml',
    'severity:',
    '  - CRITICAL',
    '  - HIGH',
    'exit-code: 1',
    `scan:`,
    `  type: ${scanType}`,
    '  skip-dirs:',
    '    - node_modules',
    '    - .git',
    '    - vendor',
    '  skip-files:',
    '    - "**/*_test.go"',
    '    - "**/*.test.ts"',
  ].join('\n');

  return Promise.resolve({ ciConfig, scannerConfig });
}

/** Validate Grype pipeline output. */
export function grypeValidateHandler(state: Readonly<GraphState>): Promise<Partial<GraphState>> {
  const rawCi = state['ciConfig'];
  let ciConfig = '';
  if (rawCi !== undefined && rawCi !== null) {
    ciConfig = toStr(rawCi);
  }

  const rawScanner = state['scannerConfig'];
  let scannerConfig = '';
  if (rawScanner !== undefined && rawScanner !== null) {
    scannerConfig = toStr(rawScanner);
  }
  const errors = validateCiConfig(ciConfig);
  if (!ciConfig.includes('grype')) errors.push('Missing grype job');
  if (scannerConfig.length === 0) errors.push('Empty scanner config');
  const output = buildOutput(ciConfig, scannerConfig, errors);
  return Promise.resolve({ validationErrors: errors, output });
}

/** Creates the Grype SCA setup graph. */
export function createGrypeSetupGraph(): CompiledGraph | undefined {
  const result = new GraphBuilder()
    .addState('stack', overwrite(''))
    .addState('scanType', overwrite('fs'))
    .addState('detectedStack', overwrite(''))
    .addState('resolvedScanType', overwrite(''))
    .addState('ciConfig', overwrite(''))
    .addState('scannerConfig', overwrite(''))
    .addState('validationErrors', overwrite([] as string[]))
    .addState('output', overwrite(''))
    .addNode('detect_stack', grypeDetectStackHandler)
    .addNode('generate_config', grypeGenerateConfigHandler)
    .addNode('validate', grypeValidateHandler)
    .addEdge(START, 'detect_stack')
    .addEdge('detect_stack', 'generate_config')
    .addEdge('generate_config', 'validate')
    .addEdge('validate', END)
    .compile();
  return result.ok ? result.value : undefined;
}

// ============================================================================
// Registration
// ============================================================================

type GraphFactory = () => CompiledGraph | undefined;

/** Returns graph factories for security setup templates, keyed by name. */
export function getSecuritySetupRegistry(): ReadonlyMap<string, GraphFactory> {
  return new Map<string, GraphFactory>([
    ['security-setup-semgrep', createSemgrepSetupGraph],
    ['security-setup-zap', createZapSetupGraph],
    ['security-setup-grype', createGrypeSetupGraph],
  ]);
}
