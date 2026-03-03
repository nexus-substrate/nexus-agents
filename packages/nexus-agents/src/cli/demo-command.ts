/**
 * nexus-agents demo command
 *
 * Exploration mode for demonstrating nexus-agents functionality.
 * Uses real CLI execution when CLIs are available and authenticated,
 * falls back to mock responses when not available.
 *
 * @module cli/demo-command
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

import type {
  MockRoutingResult,
  MockWorkflow,
  CliAvailability,
  LiveRoutingResult,
} from './demo-command-types.js';
import { colors, isValidDemoSubcommand } from './demo-command-types.js';
import {
  formatRoutingDemo,
  formatExpertListDemo,
  formatWorkflowDemo,
  formatAvailableWorkflows,
  formatLiveRoutingDemo,
} from './demo-command-formatters.js';
import { createAllAdapters } from '../cli-adapters/factory.js';
import type { CliName } from '../cli-adapters/types.js';
import { DEFAULT_CLI } from '../config/model-capabilities-types.js';

// Re-export types and validators for external use
export type { DemoSubcommand, DemoOptions } from './demo-command-types.js';
export { isValidDemoSubcommand } from './demo-command-types.js';

// ============================================================================
// CLI Availability Detection
// ============================================================================

/** Cache for CLI availability to avoid repeated checks within a session. */
let cliAvailabilityCache: readonly CliAvailability[] | null = null;

/**
 * Checks which CLIs are available and authenticated.
 * Results are cached for the duration of the session.
 */
async function getCliAvailability(): Promise<readonly CliAvailability[]> {
  if (cliAvailabilityCache !== null) {
    return cliAvailabilityCache;
  }

  const adapters = createAllAdapters();
  const cliNames: CliName[] = ['claude', 'gemini', 'codex', 'opencode'];
  const results: CliAvailability[] = [];

  for (const name of cliNames) {
    const adapter = adapters.get(name);
    if (!adapter) {
      results.push({ name, available: false, authenticated: false });
      continue;
    }

    try {
      const health = await adapter.healthCheck();
      results.push({
        name,
        available: true,
        authenticated: health.healthy,
      });
    } catch {
      results.push({ name, available: false, authenticated: false });
    }
  }

  cliAvailabilityCache = results;
  return results;
}

/** Helper to find CLI by name from authenticated list. */
function findCli(clis: readonly CliAvailability[], name: string): CliAvailability | undefined {
  return clis.find((c) => c.name === name);
}

/** Get CLI preference order based on task type. */
function getCliPreference(isCodeTask: boolean, isReasoningTask: boolean): string[] {
  // Code task: prefer codex, then claude
  if (isCodeTask && !isReasoningTask) return ['codex', 'claude'];
  // Reasoning task: prefer claude
  if (isReasoningTask) return ['claude', 'gemini'];
  // Simple task: prefer gemini for speed
  return ['gemini', 'claude'];
}

/**
 * Gets the best available CLI for task execution.
 * Prefers: codex for code, claude for reasoning, gemini for speed.
 */
function selectBestAvailableCli(
  availableClis: readonly CliAvailability[],
  isCodeTask: boolean,
  isReasoningTask: boolean
): CliAvailability | undefined {
  const authenticated = availableClis.filter((c) => c.authenticated);
  if (authenticated.length === 0) return undefined;

  const preferences = getCliPreference(isCodeTask, isReasoningTask);
  for (const name of preferences) {
    const cli = findCli(authenticated, name);
    if (cli) return cli;
  }
  return authenticated[0];
}

/**
 * Executes a task on the selected CLI and returns the result.
 */
async function executeOnCli(
  cliName: string,
  task: string
): Promise<{ result: string; timeMs: number } | undefined> {
  const adapters = createAllAdapters();
  const adapter = adapters.get(cliName as CliName);
  if (!adapter) return undefined;

  const startTime = Date.now();
  try {
    const result = await adapter.execute(
      { content: task },
      { timeoutMs: 30000 } // 30 second timeout for demo
    );

    if (!result.ok) {
      return undefined;
    }

    return {
      result: result.value.text,
      timeMs: Date.now() - startTime,
    };
  } catch {
    return undefined;
  }
}

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
  let selectedModel: string = DEFAULT_CLI;
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

// ============================================================================
// Mock Workflow Definitions
// ============================================================================

/** Code review workflow definition. */
const CODE_REVIEW_WORKFLOW: MockWorkflow = {
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
    { id: 'synthesize', agent: 'orchestrator', description: 'Synthesize findings into report' },
  ],
};

/** Feature implementation workflow definition. */
const FEATURE_IMPLEMENTATION_WORKFLOW: MockWorkflow = {
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
};

/** Security audit workflow definition. */
const SECURITY_AUDIT_WORKFLOW: MockWorkflow = {
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
};

/** Bug fix workflow definition. */
const BUG_FIX_WORKFLOW: MockWorkflow = {
  name: 'bug-fix',
  description: 'Bug fix workflow for diagnosing, fixing, and verifying bugs',
  inputs: [
    { name: 'bugDescription', type: 'string', required: true },
    { name: 'affectedFiles', type: 'array', required: false },
    { name: 'severity', type: 'string', required: false },
  ],
  steps: [
    { id: 'diagnose', agent: 'code_expert', description: 'Analyze bug to identify root cause' },
    { id: 'fix', agent: 'code_expert', description: 'Implement the bug fix' },
    { id: 'test', agent: 'testing_expert', description: 'Generate regression tests' },
    { id: 'verify', agent: 'testing_expert', description: 'Verify the fix is complete' },
  ],
};

/** Documentation update workflow definition. */
const DOCUMENTATION_UPDATE_WORKFLOW: MockWorkflow = {
  name: 'documentation-update',
  description: 'Documentation update workflow for maintaining accurate docs',
  inputs: [
    { name: 'scope', type: 'string', required: true },
    { name: 'targetFiles', type: 'array', required: false },
    { name: 'format', type: 'string', required: false },
  ],
  steps: [
    { id: 'analyze', agent: 'documentation_expert', description: 'Analyze existing docs' },
    { id: 'update', agent: 'documentation_expert', description: 'Update and generate docs' },
    { id: 'review', agent: 'code_expert', description: 'Technical accuracy review' },
  ],
};

/** Refactoring workflow definition. */
const REFACTORING_WORKFLOW: MockWorkflow = {
  name: 'refactoring',
  description: 'Guided code refactoring with analysis and verification',
  inputs: [
    { name: 'files', type: 'array', required: true },
    { name: 'goals', type: 'string', required: false },
    { name: 'scope', type: 'string', required: false },
  ],
  steps: [
    { id: 'analyze', agent: 'code_expert', description: 'Analyze code smells' },
    { id: 'architecture', agent: 'architecture_expert', description: 'Review structure' },
    { id: 'plan', agent: 'orchestrator', description: 'Create refactoring plan' },
    { id: 'recommend', agent: 'code_expert', description: 'Generate recommendations' },
  ],
};

/** Test generation workflow definition. */
const TEST_GENERATION_WORKFLOW: MockWorkflow = {
  name: 'test-generation',
  description: 'Automated test creation and coverage improvement',
  inputs: [
    { name: 'files', type: 'array', required: true },
    { name: 'testType', type: 'string', required: false },
    { name: 'coverage', type: 'number', required: false },
  ],
  steps: [
    { id: 'coverage', agent: 'testing_expert', description: 'Analyze test coverage' },
    { id: 'structure', agent: 'code_expert', description: 'Analyze code testability' },
    { id: 'unit_tests', agent: 'testing_expert', description: 'Generate unit tests' },
    { id: 'integration_tests', agent: 'testing_expert', description: 'Generate integration tests' },
    { id: 'validate', agent: 'testing_expert', description: 'Validate test quality' },
  ],
};

/** All available mock workflows. */
const MOCK_WORKFLOWS: Record<string, MockWorkflow> = {
  'code-review': CODE_REVIEW_WORKFLOW,
  'feature-implementation': FEATURE_IMPLEMENTATION_WORKFLOW,
  'security-audit': SECURITY_AUDIT_WORKFLOW,
  'bug-fix': BUG_FIX_WORKFLOW,
  'documentation-update': DOCUMENTATION_UPDATE_WORKFLOW,
  refactoring: REFACTORING_WORKFLOW,
  'test-generation': TEST_GENERATION_WORKFLOW,
};

/**
 * Gets mock workflow data by name.
 */
function getMockWorkflow(name: string): MockWorkflow | undefined {
  return MOCK_WORKFLOWS[name];
}

/**
 * Gets list of available mock workflows.
 */
function getAvailableWorkflows(): Array<{ name: string; description: string }> {
  const names = [
    'code-review',
    'feature-implementation',
    'security-audit',
    'bug-fix',
    'documentation-update',
    'refactoring',
    'test-generation',
  ];
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
 * Uses real CLI execution when available, falls back to mock.
 */
export async function runRoutingDemo(task: string, execute: boolean = true): Promise<string> {
  const mockResult = analyzeTaskForDemo(task);
  const availableClis = await getCliAvailability();
  const hasAuthenticatedCli = availableClis.some((c) => c.authenticated);

  // If no authenticated CLIs or execution disabled, use mock
  if (!hasAuthenticatedCli || !execute) {
    return formatRoutingDemo(mockResult);
  }

  // Find best CLI for task type
  const isCodeTask = /code|implement|write|function|class|refactor/i.test(task);
  const isReasoningTask = /explain|analyze|review|architecture|design/i.test(task);
  const selectedCli = selectBestAvailableCli(availableClis, isCodeTask, isReasoningTask);

  if (!selectedCli) {
    return formatRoutingDemo(mockResult);
  }

  // Build live result
  const liveResult: LiveRoutingResult = {
    ...mockResult,
    mode: 'live',
    availableClis,
    selectedModel: selectedCli.name,
    selectionReason: `Selected ${selectedCli.name} (authenticated and available)`,
  };

  // Execute task on selected CLI
  const execution = await executeOnCli(selectedCli.name, task);
  if (execution) {
    return formatLiveRoutingDemo({
      ...liveResult,
      executionResult: execution.result,
      executionTime: execution.timeMs,
    });
  }

  // Execution failed, show routing only
  return formatLiveRoutingDemo(liveResult);
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
${colors.bold}nexus-agents demo${colors.reset} - exploration mode

${colors.bold}USAGE:${colors.reset}
  nexus-agents demo <subcommand> [options]

${colors.bold}SUBCOMMANDS:${colors.reset}
  routing "task"      Route task to best model and execute (live or mock)
  expert-list         Show available experts with descriptions
  workflow [name]     Show workflow steps (dry-run preview)

${colors.bold}OPTIONS:${colors.reset}
  --mock              Force mock mode (no CLI execution)

${colors.bold}EXAMPLES:${colors.reset}
  nexus-agents demo routing "Implement a sorting algorithm"
  nexus-agents demo routing "Explain JavaScript closures"
  nexus-agents demo routing "Hello world" --mock
  nexus-agents demo expert-list
  nexus-agents demo workflow
  nexus-agents demo workflow code-review

${colors.bold}NOTES:${colors.reset}
  - If CLIs (claude, gemini, codex) are available and authenticated,
    routing demo will execute tasks using the selected CLI
  - Falls back to mock mode when no authenticated CLIs are found
  - Use --mock to always use mock mode (API-free)
  - Run "nexus-agents doctor" to check CLI availability

`);
}

/** Handle routing subcommand. */
async function handleRoutingSubcommand(
  args: string[],
  options?: { mock?: boolean }
): Promise<{ output: string; exitCode: number }> {
  const task = args[0];
  if (task === undefined || task.length === 0) {
    process.stderr.write('Error: Task is required for routing demo.\n');
    process.stderr.write('Usage: nexus-agents demo routing "your task here"\n');
    return { output: '', exitCode: 1 };
  }
  const executeReal = !(options?.mock ?? false);
  const output = await runRoutingDemo(task, executeReal);
  return { output, exitCode: 0 };
}

/**
 * Main demo command entry point.
 *
 * @param subcommand - The demo subcommand to run
 * @param args - Additional arguments for the subcommand
 * @param options - Additional options (--mock to force mock mode)
 * @returns Exit code (0 = success, 1 = error)
 */
export async function demoCommand(
  subcommand: string | undefined,
  args: string[],
  options?: { mock?: boolean }
): Promise<number> {
  if (subcommand === undefined || !isValidDemoSubcommand(subcommand)) {
    printDemoHelp();
    return subcommand === undefined ? 0 : 1;
  }

  switch (subcommand) {
    case 'routing': {
      const result = await handleRoutingSubcommand(args, options);
      if (result.exitCode !== 0) return result.exitCode;
      process.stdout.write(result.output);
      return 0;
    }
    case 'expert-list':
      process.stdout.write(runExpertListDemo());
      return 0;
    case 'workflow':
      process.stdout.write(runWorkflowDemo(args[0]));
      return 0;
  }
}
