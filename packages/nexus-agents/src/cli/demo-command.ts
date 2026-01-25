/**
 * nexus-agents demo command
 *
 * API-free exploration mode for demonstrating nexus-agents functionality
 * without requiring API keys. All responses are canned/mock.
 *
 * @module cli/demo-command
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

import type { MockRoutingResult, MockWorkflow } from './demo-command-types.js';
import { colors, isValidDemoSubcommand } from './demo-command-types.js';
import {
  formatRoutingDemo,
  formatExpertListDemo,
  formatWorkflowDemo,
  formatAvailableWorkflows,
} from './demo-command-formatters.js';

// Re-export types and validators for external use
export type { DemoSubcommand, DemoOptions } from './demo-command-types.js';
export { isValidDemoSubcommand } from './demo-command-types.js';

// ============================================================================
// Mock Data Generation
// ============================================================================

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

/**
 * Gets list of available mock workflows.
 */
function getAvailableWorkflows(): Array<{ name: string; description: string }> {
  const names = ['code-review', 'feature-implementation', 'security-audit'];
  return names
    .map((name) => {
      const workflow = getMockWorkflow(name);
      return workflow !== undefined
        ? { name: workflow.name, description: workflow.description }
        : undefined;
    })
    .filter((w): w is { name: string; description: string } => w !== undefined);
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
    return formatAvailableWorkflows(getAvailableWorkflows());
  }

  const workflow = getMockWorkflow(workflowName);
  if (workflow === undefined) {
    return (
      `\n${colors.yellow}Workflow "${workflowName}" not found.${colors.reset}\n` +
      formatAvailableWorkflows(getAvailableWorkflows())
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
