/**
 * nexus-agents workflow run command
 *
 * Executes a workflow template from the command line.
 *
 * (Source: Issue #67, PROJECT_PLAN.md Section 5.2)
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflowFile, validateWorkflow } from '../workflows/index.js';
import {
  createTemplateRegistry,
  type ITemplateRegistry,
  type TemplateMetadata,
} from '../workflows/index.js';
import type { WorkflowDefinition, InputDefinition } from '../core/index.js';

/**
 * ANSI color codes for terminal output.
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Options for the workflow run command.
 */
export interface WorkflowRunOptions {
  /** Workflow name or path */
  readonly name: string;
  /** Input JSON string or file path */
  readonly input: string | undefined;
  /** Dry run mode (validate without executing) */
  readonly dryRun: boolean | undefined;
  /** Verbose output */
  readonly verbose: boolean | undefined;
}

/**
 * Result of workflow run command.
 */
export interface WorkflowRunResult {
  readonly success: boolean;
  readonly message: string;
  readonly workflowName?: string;
  readonly dryRun: boolean;
  readonly validationErrors?: string[];
  readonly executionId?: string;
  readonly steps?: number;
}

/**
 * Parsed workflow inputs.
 */
type ParsedInputs = Record<string, unknown>;

/**
 * Parses input from string or file path.
 *
 * @param inputArg - JSON string or file path
 * @returns Parsed inputs object
 */
function parseInputs(inputArg: string): ParsedInputs {
  // Check if it's a file path
  if (inputArg.endsWith('.json') || inputArg.startsWith('./') || inputArg.startsWith('/')) {
    const resolvedPath = path.resolve(inputArg);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Input file not found: ${inputArg}`);
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as ParsedInputs;
  }

  // Otherwise parse as JSON string
  return JSON.parse(inputArg) as ParsedInputs;
}

/**
 * Validates inputs against workflow definition.
 */
function validateInputs(
  workflow: WorkflowDefinition,
  inputs: ParsedInputs
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const inputDef of workflow.inputs) {
    const value = inputs[inputDef.name];
    const isRequired = inputDef.required === true;
    const hasValue = value !== undefined;
    const hasDefault = inputDef.default !== undefined;

    if (isRequired && !hasValue && !hasDefault) {
      errors.push(`Missing required input: ${inputDef.name}`);
    }

    // Type validation
    if (hasValue && !validateInputType(value, inputDef)) {
      errors.push(
        `Invalid type for input '${inputDef.name}': expected ${inputDef.type}, got ${typeof value}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates input value against type definition.
 */
function validateInputType(value: unknown, inputDef: InputDefinition): boolean {
  switch (inputDef.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Resolves workflow by name or path.
 */
async function resolveWorkflow(
  nameOrPath: string,
  registry: ITemplateRegistry
): Promise<{ workflow: WorkflowDefinition; source: string }> {
  // Check if it's a file path
  if (
    nameOrPath.endsWith('.yaml') ||
    nameOrPath.endsWith('.yml') ||
    nameOrPath.startsWith('./') ||
    nameOrPath.startsWith('/')
  ) {
    const result = await loadWorkflowFile(nameOrPath);
    if (!result.ok) {
      throw new Error(`Failed to load workflow: ${result.error.message}`);
    }
    return { workflow: result.value, source: nameOrPath };
  }

  // Look up in registry
  const workflow = registry.getById(nameOrPath);
  if (workflow === undefined) {
    throw new Error(`Workflow not found: ${nameOrPath}`);
  }
  return { workflow, source: `builtin:${nameOrPath}` };
}

/**
 * Formats a step for display.
 */
function formatStep(step: { id: string; agent: string; action: string }, index: number): string {
  const num = String(index + 1).padStart(2, ' ');
  return `  ${num}. ${colors.cyan}${step.id}${colors.reset} → ${step.agent}::${step.action}`;
}

/**
 * Initializes the template registry.
 */
async function initializeRegistry(): Promise<ITemplateRegistry> {
  const registry = createTemplateRegistry();
  await (registry as { initialize?: () => Promise<void> }).initialize?.();
  return registry;
}

/**
 * Creates a failure result with the given message.
 */
function createFailureResult(
  message: string,
  dryRun: boolean,
  workflowName?: string
): WorkflowRunResult {
  const result: WorkflowRunResult = { success: false, message, dryRun };
  if (workflowName !== undefined) {
    return { ...result, workflowName };
  }
  return result;
}

/**
 * Validates and parses workflow inputs.
 */
function parseAndValidateInputs(
  workflow: WorkflowDefinition,
  input: string | undefined,
  dryRun: boolean
): { success: true; inputs: ParsedInputs } | { success: false; result: WorkflowRunResult } {
  let parsedInputs: ParsedInputs = {};

  if (input !== undefined) {
    try {
      parsedInputs = parseInputs(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        result: createFailureResult(`Failed to parse inputs: ${message}`, dryRun, workflow.name),
      };
    }
  }

  const validation = validateInputs(workflow, parsedInputs);
  if (!validation.valid) {
    return {
      success: false,
      result: {
        ...createFailureResult('Input validation failed', dryRun, workflow.name),
        validationErrors: validation.errors,
      },
    };
  }

  return { success: true, inputs: parsedInputs };
}

/**
 * Runs the workflow run command.
 *
 * @param options - Run options
 * @returns Run result
 */
export async function runWorkflowRun(options: WorkflowRunOptions): Promise<WorkflowRunResult> {
  const { name, input, dryRun = false } = options;
  const registry = await initializeRegistry();

  // Resolve workflow
  let workflow: WorkflowDefinition;
  try {
    const resolved = await resolveWorkflow(name, registry);
    workflow = resolved.workflow;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createFailureResult(message, dryRun);
  }

  // Validate workflow structure
  const structureValidation = validateWorkflow(workflow);
  if (!structureValidation.ok) {
    return {
      ...createFailureResult(
        `Workflow validation failed: ${structureValidation.error.message}`,
        dryRun,
        workflow.name
      ),
      validationErrors: [structureValidation.error.message],
    };
  }

  // Parse and validate inputs
  const inputResult = parseAndValidateInputs(workflow, input, dryRun);
  if (!inputResult.success) {
    return inputResult.result;
  }

  // Return success result
  const successMessage = dryRun
    ? `Dry run: Workflow '${workflow.name}' is valid and ready to execute`
    : `Workflow '${workflow.name}' validated. Full execution requires MCP server mode.`;

  return {
    success: true,
    message: successMessage,
    workflowName: workflow.name,
    dryRun,
    steps: workflow.steps.length,
  };
}

/**
 * Writes a line to stdout.
 */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Prints success result details.
 */
function printSuccessResult(
  result: WorkflowRunResult,
  workflow: WorkflowDefinition | undefined,
  verbose: boolean
): void {
  const title = result.dryRun ? 'Dry Run Complete' : 'Workflow Ready';
  writeLine(`${colors.green}✓${colors.reset} ${colors.bold}${title}${colors.reset}`);
  writeLine(`  Workflow: ${colors.cyan}${result.workflowName ?? 'unknown'}${colors.reset}`);

  if (result.steps !== undefined) {
    writeLine(`  Steps: ${String(result.steps)}`);
  }

  if (workflow !== undefined && verbose) {
    writeLine('');
    writeLine(`${colors.bold}Execution Plan:${colors.reset}`);
    for (const [index, step] of workflow.steps.entries()) {
      writeLine(formatStep(step, index));
    }
  }

  if (!result.dryRun) {
    writeLine('');
    writeLine(`${colors.dim}Note: Full execution requires the MCP server.${colors.reset}`);
    writeLine(`${colors.dim}Run: nexus-agents (then use orchestrate tool)${colors.reset}`);
  }
}

/**
 * Prints failure result details.
 */
function printFailureResult(result: WorkflowRunResult): void {
  writeLine(`${colors.red}✗${colors.reset} ${colors.bold}Workflow Failed${colors.reset}`);
  writeLine(`  ${result.message}`);

  if (result.validationErrors !== undefined && result.validationErrors.length > 0) {
    writeLine('');
    writeLine(`${colors.bold}Validation Errors:${colors.reset}`);
    for (const error of result.validationErrors) {
      writeLine(`  ${colors.red}•${colors.reset} ${error}`);
    }
  }
}

/**
 * Prints the workflow run result.
 */
export function printWorkflowRunResult(
  result: WorkflowRunResult,
  options: { workflow?: WorkflowDefinition; verbose?: boolean } = {}
): void {
  const { workflow, verbose = false } = options;

  writeLine('');
  if (result.success) {
    printSuccessResult(result, workflow, verbose);
  } else {
    printFailureResult(result);
  }
  writeLine('');
}

/**
 * Lists available workflow templates.
 */
export async function listWorkflowTemplates(): Promise<TemplateMetadata[]> {
  const registry = createTemplateRegistry();
  await (registry as { initialize?: () => Promise<void> }).initialize?.();
  return registry.getAll();
}

/**
 * Prints available workflow templates.
 */
export async function printWorkflowTemplates(): Promise<void> {
  const templates = await listWorkflowTemplates();

  writeLine('');
  writeLine(`${colors.bold}Available Workflow Templates:${colors.reset}`);
  writeLine('');

  if (templates.length === 0) {
    writeLine(`  ${colors.dim}No templates found${colors.reset}`);
    return;
  }

  // Group by category
  const byCategory = new Map<string, TemplateMetadata[]>();
  for (const template of templates) {
    const category = template.category;
    const existing = byCategory.get(category) ?? [];
    existing.push(template);
    byCategory.set(category, existing);
  }

  for (const [category, categoryTemplates] of byCategory) {
    writeLine(`  ${colors.cyan}${category}:${colors.reset}`);
    for (const template of categoryTemplates) {
      const builtInTag = template.builtIn ? ` ${colors.dim}(built-in)${colors.reset}` : '';
      writeLine(`    • ${template.name}${builtInTag}`);
      if (template.description !== undefined) {
        const desc = template.description.split('\n')[0] ?? '';
        writeLine(`      ${colors.dim}${desc.slice(0, 60)}${colors.reset}`);
      }
    }
    writeLine('');
  }
}

/**
 * Runs the workflow run command and prints results.
 * Returns exit code (0 = success).
 */
export async function workflowRunCommand(options: WorkflowRunOptions): Promise<number> {
  const result = await runWorkflowRun(options);

  // Get workflow for verbose output
  let workflow: WorkflowDefinition | undefined;
  if (result.success && options.verbose === true) {
    const registry = createTemplateRegistry();
    await (registry as { initialize?: () => Promise<void> }).initialize?.();
    workflow = registry.getById(options.name);
  }

  // Build options object without undefined values
  const printOptions: { workflow?: WorkflowDefinition; verbose?: boolean } = {};
  if (workflow !== undefined) {
    printOptions.workflow = workflow;
  }
  if (options.verbose !== undefined) {
    printOptions.verbose = options.verbose;
  }
  printWorkflowRunResult(result, printOptions);
  return result.success ? 0 : 1;
}
