/**
 * @nexus-agents/workflows - Workflow Parser
 *
 * Parses and validates workflow definitions from YAML and JSON formats.
 * Uses Zod schemas for runtime validation at the parsing boundary.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { type Result, ok, err, ParseError, SecurityError } from '@nexus-agents/core';
import type { WorkflowDefinition, WorkflowStep, InputDefinition } from '@nexus-agents/core';
import {
  WorkflowDefinitionSchema,
  formatZodErrors,
  type WorkflowDefinitionOutput,
} from './workflow-types.js';
import { validateDependencyGraph } from './dependency-graph.js';

/**
 * Maximum file size for workflow templates (1MB).
 */
const MAX_FILE_SIZE_BYTES = 1024 * 1024;

/**
 * Supported workflow file extensions.
 */
const SUPPORTED_EXTENSIONS = ['.yaml', '.yml', '.json'] as const;

/**
 * Validates that a file path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 * @param userPath - The user-provided file path
 * @param allowedRoot - The root directory that paths must be within
 * @returns Result with validated absolute path or SecurityError
 */
function validatePath(userPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolvedRoot = path.resolve(allowedRoot);
  const resolved = path.resolve(allowedRoot, userPath);

  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    return err(
      new SecurityError('Path traversal detected: path escapes allowed root directory', {
        context: { userPath, allowedRoot: resolvedRoot },
      })
    );
  }
  return ok(resolved);
}

/**
 * Parses a YAML string into a WorkflowDefinition.
 * @param content - YAML string content
 * @returns Result with WorkflowDefinition or ParseError
 */
export function parseWorkflowYaml(content: string): Result<WorkflowDefinition, ParseError> {
  // Parse YAML to JavaScript object
  let parsed: unknown;
  try {
    parsed = yaml.parse(content, {
      strict: true,
      uniqueKeys: true,
    });
  } catch (e) {
    const yamlError = e as yaml.YAMLParseError;
    const linePos = yamlError.linePos?.[0];
    const errorOptions: { line?: number; column?: number } = {};
    if (linePos?.line !== undefined) {
      errorOptions.line = linePos.line;
    }
    if (linePos?.col !== undefined) {
      errorOptions.column = linePos.col;
    }
    return err(new ParseError(`YAML parse error: ${yamlError.message}`, errorOptions));
  }

  // Validate against schema
  return validateWorkflowObject(parsed);
}

/**
 * Parses a JSON string into a WorkflowDefinition.
 * @param content - JSON string content
 * @returns Result with WorkflowDefinition or ParseError
 */
export function parseWorkflowJson(content: string): Result<WorkflowDefinition, ParseError> {
  // Parse JSON to JavaScript object
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (e) {
    const jsonError = e as SyntaxError;
    // Extract line/column from JSON parse error message if possible
    const posMatch = jsonError.message.match(/position (\d+)/);
    const matchGroup = posMatch?.[1];
    const position = matchGroup !== undefined ? parseInt(matchGroup, 10) : undefined;
    const lineInfo = position !== undefined ? findLineColumn(content, position) : undefined;

    const errorOptions: { line?: number; column?: number } = {};
    if (lineInfo?.line !== undefined) {
      errorOptions.line = lineInfo.line;
    }
    if (lineInfo?.column !== undefined) {
      errorOptions.column = lineInfo.column;
    }

    return err(new ParseError(`JSON parse error: ${jsonError.message}`, errorOptions));
  }

  // Validate against schema
  return validateWorkflowObject(parsed);
}

/**
 * Validates a parsed object against the WorkflowDefinition schema.
 * @param obj - Parsed object to validate
 * @returns Result with WorkflowDefinition or ParseError
 */
function validateWorkflowObject(obj: unknown): Result<WorkflowDefinition, ParseError> {
  const result = WorkflowDefinitionSchema.safeParse(obj);

  if (!result.success) {
    const issues = formatZodErrors(result.error);
    const message = issues
      .map((issue) => {
        const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${pathStr}: ${issue.message}`;
      })
      .join('; ');

    return err(new ParseError(`Validation error: ${message}`));
  }

  // Convert Zod output to WorkflowDefinition interface
  const workflow = toWorkflowDefinition(result.data);

  // Validate dependency graph
  const graphResult = validateDependencyGraph(workflow);
  if (!graphResult.ok) {
    return graphResult;
  }

  return ok(workflow);
}

/**
 * Maps Zod input definition output to core InputDefinition.
 */
function mapInputDefinition(input: WorkflowDefinitionOutput['inputs'][number]): InputDefinition {
  const inputDef: InputDefinition = {
    name: input.name,
    type: input.type,
    required: input.required,
  };
  if (input.description !== undefined) inputDef.description = input.description;
  if (input.default !== undefined) inputDef.default = input.default;
  return inputDef;
}

/**
 * Maps Zod step definition output to core WorkflowStep.
 */
function mapWorkflowStep(step: WorkflowDefinitionOutput['steps'][number]): WorkflowStep {
  const stepDef: WorkflowStep = {
    id: step.id,
    agent: step.agent,
    action: step.action,
    inputs: step.inputs,
  };
  if (step.dependsOn !== undefined) stepDef.dependsOn = step.dependsOn;
  if (step.parallel !== undefined) stepDef.parallel = step.parallel;
  if (step.retries !== undefined) stepDef.retries = step.retries;
  if (step.timeout !== undefined) stepDef.timeout = step.timeout;
  if (step.condition !== undefined) stepDef.condition = step.condition;
  return stepDef;
}

/**
 * Converts Zod schema output to WorkflowDefinition interface.
 * This ensures compatibility with the core types and exactOptionalPropertyTypes.
 */
function toWorkflowDefinition(data: WorkflowDefinitionOutput): WorkflowDefinition {
  const workflow: WorkflowDefinition = {
    name: data.name,
    version: data.version,
    inputs: data.inputs.map(mapInputDefinition),
    steps: data.steps.map(mapWorkflowStep),
  };
  if (data.description !== undefined) workflow.description = data.description;
  if (data.timeout !== undefined) workflow.timeout = data.timeout;
  return workflow;
}

/**
 * Loads and parses a workflow definition from a file.
 * @param filePath - Path to the workflow file
 * @param allowedRoot - Root directory for path validation (defaults to process.cwd())
 * @returns Result with WorkflowDefinition or ParseError/SecurityError
 */
export async function loadWorkflowFile(
  filePath: string,
  allowedRoot: string = process.cwd()
): Promise<Result<WorkflowDefinition, ParseError | SecurityError>> {
  // Validate path to prevent path traversal attacks
  const pathValidation = validatePath(filePath, allowedRoot);
  if (!pathValidation.ok) {
    return pathValidation;
  }
  const validatedPath = pathValidation.value;

  // Validate file extension
  const ext = path.extname(validatedPath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])) {
    return err(
      new ParseError(
        `Unsupported file extension: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
      )
    );
  }

  // Read file with size check
  let content: string;
  try {
    const stats = await fs.stat(validatedPath);
    if (stats.size > MAX_FILE_SIZE_BYTES) {
      return err(
        new ParseError(
          `File too large: ${String(stats.size)} bytes. Maximum: ${String(MAX_FILE_SIZE_BYTES)} bytes`
        )
      );
    }
    content = await fs.readFile(validatedPath, 'utf-8');
  } catch (e) {
    const fsError = e as NodeJS.ErrnoException;
    if (fsError.code === 'ENOENT') {
      return err(new ParseError(`File not found: ${validatedPath}`));
    }
    if (fsError.code === 'EACCES') {
      return err(new ParseError(`Permission denied: ${validatedPath}`));
    }
    return err(new ParseError(`Failed to read file: ${fsError.message}`));
  }

  // Parse based on extension
  if (ext === '.json') {
    return parseWorkflowJson(content);
  }
  return parseWorkflowYaml(content);
}

/**
 * Validates a WorkflowDefinition object.
 * Useful for validating programmatically created workflows.
 * @param workflow - WorkflowDefinition to validate
 * @returns Result with void or ParseError
 */
export function validateWorkflow(workflow: WorkflowDefinition): Result<void, ParseError> {
  // Re-validate through the schema
  const result = WorkflowDefinitionSchema.safeParse(workflow);

  if (!result.success) {
    const issues = formatZodErrors(result.error);
    const message = issues
      .map((issue) => {
        const pathStr = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `${pathStr}: ${issue.message}`;
      })
      .join('; ');

    return err(new ParseError(`Validation error: ${message}`));
  }

  // Validate dependency graph
  const graphResult = validateDependencyGraph(workflow);
  if (!graphResult.ok) {
    return err(graphResult.error);
  }

  return ok(undefined);
}

/**
 * Finds line and column number from a character position.
 * @param content - The full content string
 * @param position - Character position in the string
 * @returns Line and column numbers (1-indexed)
 */
function findLineColumn(content: string, position: number): { line: number; column: number } {
  let line = 1;
  let column = 1;

  for (let i = 0; i < position && i < content.length; i++) {
    if (content[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { line, column };
}
