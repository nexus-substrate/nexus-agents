/**
 * nexus-agents demo command
 *
 * API-free exploration mode for demonstrating nexus-agents functionality
 * without requiring API keys. All responses are canned/mock.
 *
 * @module cli/demo-command
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

import { DEFAULT_EXPERTS } from '../agents/experts/expert-defaults.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Demo command subcommands.
 */
export type DemoSubcommand = 'routing' | 'expert-list' | 'workflow';

/**
 * Options for the demo command.
 */
export interface DemoOptions {
  readonly subcommand: DemoSubcommand;
  readonly task?: string;
  readonly workflowName?: string;
}

/**
 * Validates if a string is a valid demo subcommand.
 */
export function isValidDemoSubcommand(value: string | undefined): value is DemoSubcommand {
  return value === 'routing' || value === 'expert-list' || value === 'workflow';
}

// ============================================================================
// Mock Data for Demo Mode
// ============================================================================

/**
 * Mock routing decision for demo mode.
 */
interface MockRoutingResult {
  readonly task: string;
  readonly taskProfile: {
    readonly complexity: 'low' | 'medium' | 'high';
    readonly codeGeneration: boolean;
    readonly reasoning: boolean;
    readonly estimatedTokens: number;
  };
  readonly budgetResults: readonly {
    readonly model: string;
    readonly withinBudget: boolean;
    readonly reason: string;
  }[];
  readonly topsisRanking: readonly {
    readonly model: string;
    readonly score: number;
    readonly quality: number;
    readonly cost: number;
    readonly latency: number;
  }[];
  readonly selectedModel: string;
  readonly selectionReason: string;
}

/**
 * Mock workflow for demo mode.
 */
interface MockWorkflow {
  readonly name: string;
  readonly description: string;
  readonly inputs: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
  }[];
  readonly steps: readonly {
    readonly id: string;
    readonly agent: string;
    readonly description: string;
  }[];
}

/**
 * Analyzes task to generate mock routing result.
 */
function analyzeTaskForDemo(task: string): MockRoutingResult {
  // Simple heuristics for demo
  const isCodeTask = /code|implement|write|function|class|refactor/i.test(task);
  const isReasoningTask = /explain|analyze|review|architecture|design/i.test(task);
  const isComplexTask = /complex|system|architecture|full|comprehensive/i.test(task);

  const complexity = isComplexTask ? 'high' : isCodeTask ? 'medium' : 'low';
  const estimatedTokens = isComplexTask ? 50000 : isCodeTask ? 20000 : 5000;

  // Determine best model based on task
  let selectedModel = 'claude';
  let selectionReason = 'Best reasoning for complex tasks';

  if (isCodeTask && !isReasoningTask) {
    selectedModel = 'codex';
    selectionReason = 'Specialized for code generation';
  } else if (!isComplexTask && !isReasoningTask) {
    selectedModel = 'gemini';
    selectionReason = 'Fast and cost-effective for simple tasks';
  }

  return {
    task,
    taskProfile: {
      complexity,
      codeGeneration: isCodeTask,
      reasoning: isReasoningTask,
      estimatedTokens,
    },
    budgetResults: [
      { model: 'claude', withinBudget: true, reason: 'within budget' },
      { model: 'gemini', withinBudget: true, reason: 'within budget' },
      { model: 'codex', withinBudget: true, reason: 'within budget' },
    ],
    topsisRanking: [
      { model: 'claude', score: 0.85, quality: 9.5, cost: 6.0, latency: 7.0 },
      { model: 'gemini', score: 0.72, quality: 8.0, cost: 9.0, latency: 8.5 },
      { model: 'codex', score: 0.78, quality: 8.5, cost: 8.0, latency: 9.0 },
    ].sort((a, b) => b.score - a.score),
    selectedModel,
    selectionReason,
  };
}

/**
 * Gets mock workflow data by name.
 */
function getMockWorkflow(name: string): MockWorkflow | undefined {
  const workflows: Record<string, MockWorkflow> = {
    'code-review': {
      name: 'code-review',
      description: 'Automated code review with parallel security analysis',
      inputs: [
        { name: 'files', type: 'array', required: true },
        { name: 'focus', type: 'string', required: false },
        { name: 'strictness', type: 'string', required: false },
      ],
      steps: [
        { id: 'analyze', agent: 'code_expert', description: 'Analyze code structure and quality' },
        { id: 'security', agent: 'security_expert', description: 'Security-focused code review' },
        { id: 'synthesize', agent: 'tech_lead', description: 'Synthesize findings into report' },
      ],
    },
    'feature-implementation': {
      name: 'feature-implementation',
      description: 'Guided feature implementation with TDD approach',
      inputs: [
        { name: 'description', type: 'string', required: true },
        { name: 'targetFiles', type: 'array', required: false },
      ],
      steps: [
        { id: 'plan', agent: 'architecture_expert', description: 'Create implementation plan' },
        { id: 'tests', agent: 'testing_expert', description: 'Write tests first (TDD)' },
        { id: 'implement', agent: 'code_expert', description: 'Implement the feature' },
        { id: 'review', agent: 'code_expert', description: 'Self-review implementation' },
      ],
    },
    'security-audit': {
      name: 'security-audit',
      description: 'Comprehensive security audit workflow',
      inputs: [
        { name: 'scope', type: 'string', required: true },
        { name: 'depth', type: 'string', required: false },
      ],
      steps: [
        { id: 'scan', agent: 'security_expert', description: 'Scan for vulnerabilities' },
        { id: 'analyze', agent: 'security_expert', description: 'Deep analysis of findings' },
        { id: 'report', agent: 'documentation_expert', description: 'Generate security report' },
      ],
    },
  };

  return workflows[name];
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Formats the routing demo output.
 */
function formatRoutingDemo(result: MockRoutingResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.cyan}${colors.bold}=== Routing Demo ===${colors.reset}`);
  lines.push(`${colors.dim}(This is a mock response - no API keys required)${colors.reset}`);
  lines.push('');
  lines.push(`${colors.bold}Task:${colors.reset} "${result.task}"`);
  lines.push('');

  // Task Profile
  lines.push(`${colors.bold}Task Analysis:${colors.reset}`);
  lines.push(`  Complexity:      ${result.taskProfile.complexity}`);
  lines.push(`  Code Generation: ${result.taskProfile.codeGeneration ? 'yes' : 'no'}`);
  lines.push(`  Reasoning:       ${result.taskProfile.reasoning ? 'yes' : 'no'}`);
  lines.push(`  Est. Tokens:     ${String(result.taskProfile.estimatedTokens)}`);
  lines.push('');

  // Budget Filter
  lines.push(`${colors.bold}Budget Filter:${colors.reset}`);
  for (const br of result.budgetResults) {
    const status = br.withinBudget
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.yellow}FAIL${colors.reset}`;
    lines.push(`  ${br.model.padEnd(8)} ${status} - ${br.reason}`);
  }
  lines.push('');

  // TOPSIS Ranking
  lines.push(`${colors.bold}TOPSIS Ranking:${colors.reset}`);
  lines.push(
    `  ${'Model'.padEnd(8)} ${'Score'.padStart(6)} ${'Quality'.padStart(8)} ${'Cost'.padStart(6)} ${'Latency'.padStart(8)}`
  );
  lines.push(`  ${'-'.repeat(44)}`);
  for (const score of result.topsisRanking) {
    lines.push(
      `  ${score.model.padEnd(8)} ${score.score.toFixed(2).padStart(6)} ${score.quality.toFixed(1).padStart(8)} ${score.cost.toFixed(1).padStart(6)} ${score.latency.toFixed(1).padStart(8)}`
    );
  }
  lines.push('');

  // Selection
  lines.push(`${colors.bold}${colors.green}Selected: ${result.selectedModel}${colors.reset}`);
  lines.push(`Reason: ${result.selectionReason}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the expert list demo output.
 */
function formatExpertListDemo(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.cyan}${colors.bold}=== Expert List Demo ===${colors.reset}`);
  lines.push(`${colors.dim}(Available experts - no API keys required to view)${colors.reset}`);
  lines.push('');

  lines.push(`${colors.bold}Built-in Experts:${colors.reset}`);
  lines.push('Name'.padEnd(20) + ' ' + 'Domain'.padEnd(15) + ' Capabilities');
  lines.push('-'.repeat(70));

  for (const expert of DEFAULT_EXPERTS) {
    const name = expert.name;
    const domain = expert.primaryDomain;
    const caps = expert.capabilities.join(', ');
    lines.push(`${name.padEnd(20)} ${domain.padEnd(15)} ${caps}`);
  }

  lines.push('');
  lines.push(`${colors.bold}Expert Roles:${colors.reset}`);
  lines.push(
    `  ${colors.cyan}code_expert${colors.reset}          - Code implementation, refactoring, debugging`
  );
  lines.push(
    `  ${colors.cyan}security_expert${colors.reset}      - Security analysis, vulnerability assessment`
  );
  lines.push(
    `  ${colors.cyan}architecture_expert${colors.reset}  - System design, patterns, decisions`
  );
  lines.push(
    `  ${colors.cyan}documentation_expert${colors.reset} - Technical writing, API documentation`
  );
  lines.push(`  ${colors.cyan}testing_expert${colors.reset}       - Test strategies, coverage, QA`);
  lines.push('');
  lines.push(
    `${colors.dim}Use "nexus-agents expert list" for full details with API${colors.reset}`
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the workflow demo output.
 */
function formatWorkflowDemo(workflow: MockWorkflow): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.cyan}${colors.bold}=== Workflow Demo: ${workflow.name} ===${colors.reset}`);
  lines.push(`${colors.dim}(Dry-run preview - no API keys required)${colors.reset}`);
  lines.push('');

  lines.push(`${colors.bold}Description:${colors.reset}`);
  lines.push(`  ${workflow.description}`);
  lines.push('');

  lines.push(`${colors.bold}Required Inputs:${colors.reset}`);
  for (const input of workflow.inputs) {
    const required = input.required
      ? `${colors.yellow}(required)${colors.reset}`
      : `${colors.dim}(optional)${colors.reset}`;
    lines.push(`  ${input.name}: ${input.type} ${required}`);
  }
  lines.push('');

  lines.push(`${colors.bold}Execution Steps:${colors.reset}`);
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    if (step !== undefined) {
      lines.push(
        `  ${String(i + 1)}. ${colors.cyan}[${step.id}]${colors.reset} ${step.description}`
      );
      lines.push(`     Agent: ${step.agent}`);
    }
  }
  lines.push('');

  lines.push(`${colors.bold}What would happen:${colors.reset}`);
  lines.push(`  1. Workflow validates all required inputs`);
  lines.push(`  2. Steps execute in order (parallel steps run together)`);
  lines.push(`  3. Each step invokes the specified expert agent`);
  lines.push(`  4. Results are passed to dependent steps`);
  lines.push(`  5. Final output is aggregated and returned`);
  lines.push('');

  lines.push(
    `${colors.dim}Use "nexus-agents workflow run ${workflow.name} --dry-run" with API for full validation${colors.reset}`
  );
  lines.push('');

  return lines.join('\n');
}

/**
 * Lists available workflows for demo.
 */
function formatAvailableWorkflows(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.cyan}${colors.bold}=== Available Workflows ===${colors.reset}`);
  lines.push(
    `${colors.dim}(Use "nexus-agents demo workflow <name>" to see details)${colors.reset}`
  );
  lines.push('');

  const workflows = ['code-review', 'feature-implementation', 'security-audit'];

  for (const name of workflows) {
    const workflow = getMockWorkflow(name);
    if (workflow !== undefined) {
      lines.push(`  ${colors.cyan}${name}${colors.reset}`);
      lines.push(`    ${workflow.description}`);
      lines.push('');
    }
  }

  lines.push(
    `${colors.dim}Other workflows: bug-fix, documentation-update, refactoring, test-generation${colors.reset}`
  );
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Command Implementation
// ============================================================================

/**
 * Runs the routing demo subcommand.
 */
export function runRoutingDemo(task: string): string {
  const result = analyzeTaskForDemo(task);
  return formatRoutingDemo(result);
}

/**
 * Runs the expert-list demo subcommand.
 */
export function runExpertListDemo(): string {
  return formatExpertListDemo();
}

/**
 * Runs the workflow demo subcommand.
 */
export function runWorkflowDemo(workflowName: string | undefined): string {
  if (workflowName === undefined || workflowName.length === 0) {
    return formatAvailableWorkflows();
  }

  const workflow = getMockWorkflow(workflowName);
  if (workflow === undefined) {
    return (
      `\n${colors.yellow}Workflow "${workflowName}" not found.${colors.reset}\n` +
      formatAvailableWorkflows()
    );
  }

  return formatWorkflowDemo(workflow);
}

/**
 * Prints the demo command help.
 */
export function printDemoHelp(): void {
  process.stdout.write(`
${colors.bold}nexus-agents demo${colors.reset} - API-free exploration mode

${colors.bold}USAGE:${colors.reset}
  nexus-agents demo <subcommand> [options]

${colors.bold}SUBCOMMANDS:${colors.reset}
  routing "task"      Show how routing would select models (mock)
  expert-list         Show available experts with descriptions
  workflow [name]     Show workflow steps (dry-run preview)

${colors.bold}EXAMPLES:${colors.reset}
  nexus-agents demo routing "Implement a sorting algorithm"
  nexus-agents demo routing "Explain JavaScript closures"
  nexus-agents demo expert-list
  nexus-agents demo workflow
  nexus-agents demo workflow code-review

${colors.bold}NOTES:${colors.reset}
  - All responses are mock/canned - no API keys required
  - Use this to understand what nexus-agents can do
  - For real execution, configure API keys and use the main commands

`);
}

/**
 * Main demo command entry point.
 *
 * @param subcommand - The demo subcommand to run
 * @param args - Additional arguments for the subcommand
 * @returns Exit code (0 = success, 1 = error)
 */
export function demoCommand(subcommand: string | undefined, args: string[]): number {
  if (subcommand === undefined || !isValidDemoSubcommand(subcommand)) {
    printDemoHelp();
    return subcommand === undefined ? 0 : 1;
  }

  let output: string;

  switch (subcommand) {
    case 'routing': {
      const task = args[0];
      if (task === undefined || task.length === 0) {
        process.stderr.write('Error: Task is required for routing demo.\n');
        process.stderr.write('Usage: nexus-agents demo routing "your task here"\n');
        return 1;
      }
      output = runRoutingDemo(task);
      break;
    }
    case 'expert-list':
      output = runExpertListDemo();
      break;
    case 'workflow':
      output = runWorkflowDemo(args[0]);
      break;
  }

  process.stdout.write(output);
  return 0;
}
