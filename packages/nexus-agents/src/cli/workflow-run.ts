/**
 * nexus-agents workflow run command
 *
 * Executes a workflow template from the command line.
 *
 * (Source: Issue #67, PROJECT_PLAN.md Section 5.2)
 *
 * File structure: Types in workflow-run-types.ts, formatters in
 * workflow-run-formatters.ts. Extracted per Issue #272.
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
import { SecurityError, getErrorMessage } from '../core/index.js';

// Re-export types and formatters
export type { WorkflowRunOptions, WorkflowRunResult, ParsedInputs } from './workflow-run-types.js';
export { printWorkflowRunResult, formatStep } from './workflow-run-formatters.js';

// Local imports from extracted modules
import type { WorkflowRunOptions, WorkflowRunResult, ParsedInputs } from './workflow-run-types.js';
import { printWorkflowRunResult, printWorkflowTemplateList } from './workflow-run-formatters.js';

/**
 * Validates that a file path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 *
 * @param userPath - The user-provided file path
 * @param allowedRoot - The root directory that paths must be within
 * @returns The validated absolute path
 * @throws SecurityError if path traversal is detected
 */
function validateInputPath(userPath: string, allowedRoot: string): string {
  const resolvedRoot = path.resolve(allowedRoot);
  const resolved = path.resolve(allowedRoot, userPath);

  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new SecurityError('Path traversal detected: input file path escapes allowed directory', {
      context: { userPath, allowedRoot: resolvedRoot },
    });
  }
  return resolved;
}

/**
 * Parses input from string or file path.
 * Uses path validation to prevent path traversal attacks.
 *
 * @param inputArg - JSON string or file path
 * @returns Parsed inputs object
 * @throws SecurityError if path traversal is detected
 * @throws Error if file not found or JSON parse fails
 */
function parseInputs(inputArg: string): ParsedInputs {
  // Check if it's a file path
  if (inputArg.endsWith('.json') || inputArg.startsWith('./') || inputArg.startsWith('/')) {
    // Validate path against current working directory to prevent traversal
    const cwd = process.cwd();
    const validatedPath = validateInputPath(inputArg, cwd);

    if (!fs.existsSync(validatedPath)) {
      throw new Error(
        `Input file not found: ${inputArg}\n` +
          `Hint: Ensure the file exists and the path is correct relative to ${cwd}`
      );
    }
    const content = fs.readFileSync(validatedPath, 'utf-8');
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
    throw new Error(
      `Workflow not found: ${nameOrPath}\n` +
        `Hint: Run 'nexus-agents workflow list' to see available workflows, ` +
        `or provide a path to a .yaml file.`
    );
  }
  return { workflow, source: `builtin:${nameOrPath}` };
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
      const message = getErrorMessage(error);
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
    const message = getErrorMessage(error);
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
  printWorkflowTemplateList(templates);
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
