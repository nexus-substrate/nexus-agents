/**
 * nexus-agents/workflows - Template Loader
 *
 * Utilities for loading and parsing YAML workflow templates.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Result } from '../core/index.js';
import { ParseError, SecurityError } from '../core/index.js';
import type { WorkflowDefinition } from '../core/index.js';
import {
  WorkflowDefinitionSchema,
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_KEYWORDS,
  type BuiltInTemplateName,
  type TemplateMetadata,
} from './template-types.js';

/**
 * Result of parsing a template file.
 */
export interface ParsedTemplate {
  definition: WorkflowDefinition;
  metadata: TemplateMetadata;
}

/**
 * Validates that a file path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 * @param userPath - The user-provided file path
 * @param allowedRoot - The root directory that paths must be within
 * @returns Result with validated absolute path or SecurityError
 */
function validatePath(userPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolvedRoot = resolve(allowedRoot);
  const resolved = resolve(allowedRoot, userPath);

  if (!resolved.startsWith(resolvedRoot + sep) && resolved !== resolvedRoot) {
    return {
      ok: false,
      error: new SecurityError('Path traversal detected: path escapes allowed root directory', {
        context: { userPath, allowedRoot: resolvedRoot },
      }),
    };
  }
  return { ok: true, value: resolved };
}

/**
 * Get the directory containing built-in templates.
 * @returns Path to templates directory
 */
export function getBuiltInTemplatesPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  return join(currentDir, 'templates');
}

/**
 * Create a validation error result.
 */
function createValidationError(
  errors: Array<{ path: (string | number)[]; message: string }>
): Result<WorkflowDefinition, ParseError> {
  const firstError = errors[0];
  const errorPath = firstError?.path.join('.') ?? 'unknown';
  const message = `Validation error at '${errorPath}': ${firstError?.message ?? 'Unknown error'}`;
  return { ok: false, error: new ParseError(message) };
}

/**
 * Create a parse error result from an exception.
 */
function createParseErrorFromException(
  error: unknown,
  filePath: string
): Result<WorkflowDefinition, ParseError> {
  if (error instanceof Error) {
    const lineMatch = error.message.match(/at line (\d+)/);
    const lineNumber = lineMatch?.[1] !== undefined ? parseInt(lineMatch[1], 10) : undefined;
    const parseError = new ParseError(
      `Failed to parse ${filePath}: ${error.message}`,
      lineNumber !== undefined ? { line: lineNumber } : undefined
    );
    return { ok: false, error: parseError };
  }
  return { ok: false, error: new ParseError(`Unknown error parsing ${filePath}`) };
}

/**
 * Parse a YAML template string into a WorkflowDefinition.
 * @param content - YAML content to parse
 * @param filePath - Path to the file (for error messages)
 * @returns Result with WorkflowDefinition or ParseError
 */
export function parseTemplateContent(
  content: string,
  filePath: string
): Result<WorkflowDefinition, ParseError> {
  try {
    const parsed: unknown = parseYaml(content);
    const validated = WorkflowDefinitionSchema.safeParse(parsed);

    if (!validated.success) {
      return createValidationError(validated.error.errors);
    }

    const definition = validated.data as WorkflowDefinition;
    return { ok: true, value: definition };
  } catch (error) {
    return createParseErrorFromException(error, filePath);
  }
}

/**
 * Load a template from a file path.
 * @param filePath - Path to the YAML template file
 * @param allowedRoot - Optional root directory for path validation (skipped if undefined)
 * @returns Result with ParsedTemplate or ParseError/SecurityError
 */
export async function loadTemplateFile(
  filePath: string,
  allowedRoot?: string
): Promise<Result<ParsedTemplate, ParseError | SecurityError>> {
  // If allowedRoot is provided, validate the path
  let validatedPath = filePath;
  if (allowedRoot !== undefined) {
    const pathValidation = validatePath(filePath, allowedRoot);
    if (!pathValidation.ok) {
      return pathValidation;
    }
    validatedPath = pathValidation.value;
  }

  try {
    const content = await readFile(validatedPath, 'utf-8');
    const parseResult = parseTemplateContent(content, validatedPath);

    if (!parseResult.ok) {
      return parseResult;
    }

    const definition = parseResult.value;
    const templateName = basename(validatedPath, extname(validatedPath));
    const isBuiltIn = BUILT_IN_TEMPLATES.includes(templateName as BuiltInTemplateName);

    const metadata: TemplateMetadata = {
      name: definition.name,
      version: definition.version,
      path: validatedPath,
      category: isBuiltIn ? TEMPLATE_CATEGORIES[templateName as BuiltInTemplateName] : 'custom',
      keywords: isBuiltIn
        ? TEMPLATE_KEYWORDS[templateName as BuiltInTemplateName]
        : extractKeywords(definition),
      builtIn: isBuiltIn,
    };
    if (definition.description !== undefined) {
      metadata.description = definition.description;
    }

    return { ok: true, value: { definition, metadata } };
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        error: new ParseError(`Failed to read ${validatedPath}: ${error.message}`),
      };
    }
    return {
      ok: false,
      error: new ParseError(`Unknown error reading ${validatedPath}`),
    };
  }
}

/**
 * Load all templates from a directory.
 * Validates each file path to prevent path traversal attacks.
 * @param directoryPath - Path to directory containing YAML templates
 * @returns Array of successfully loaded templates and any errors
 */
export async function loadTemplatesFromDirectory(
  directoryPath: string
): Promise<{ templates: ParsedTemplate[]; errors: Array<ParseError | SecurityError> }> {
  const templates: ParsedTemplate[] = [];
  const errors: Array<ParseError | SecurityError> = [];

  try {
    // Resolve the directory path to an absolute path
    const resolvedDirectory = resolve(directoryPath);

    const stats = await stat(resolvedDirectory);
    if (!stats.isDirectory()) {
      errors.push(new ParseError(`${resolvedDirectory} is not a directory`));
      return { templates, errors };
    }

    const entries = await readdir(resolvedDirectory);

    for (const entry of entries) {
      if (!isYamlFile(entry)) {
        continue;
      }

      // Validate the entry path to prevent path traversal
      // (e.g., if readdir somehow returned "../malicious.yaml")
      const pathValidation = validatePath(entry, resolvedDirectory);
      if (!pathValidation.ok) {
        errors.push(pathValidation.error);
        continue;
      }

      const filePath = pathValidation.value;
      // Pass the resolved directory as allowedRoot to ensure consistent validation
      const result = await loadTemplateFile(filePath, resolvedDirectory);

      if (result.ok) {
        templates.push(result.value);
      } else {
        errors.push(result.error);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      errors.push(new ParseError(`Failed to read directory ${directoryPath}: ${error.message}`));
    }
  }

  return { templates, errors };
}

/**
 * Load all built-in templates.
 * @returns Map of template name to WorkflowDefinition
 */
export async function getBuiltInTemplates(): Promise<Map<string, WorkflowDefinition>> {
  const templatesPath = getBuiltInTemplatesPath();
  const result = await loadTemplatesFromDirectory(templatesPath);

  const templateMap = new Map<string, WorkflowDefinition>();

  for (const { definition } of result.templates) {
    templateMap.set(definition.name, definition);
  }

  return templateMap;
}

/**
 * Load built-in templates with full metadata.
 * @returns Array of parsed templates with metadata
 */
export async function getBuiltInTemplatesWithMetadata(): Promise<ParsedTemplate[]> {
  const templatesPath = getBuiltInTemplatesPath();
  const result = await loadTemplatesFromDirectory(templatesPath);
  return result.templates;
}

/**
 * Check if a file is a YAML file.
 * @param filename - Filename to check
 * @returns True if file has YAML extension
 */
function isYamlFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ext === '.yaml' || ext === '.yml';
}

/**
 * Extract keywords from a workflow definition.
 * @param definition - Workflow definition
 * @returns Array of keywords
 */
function extractKeywords(definition: WorkflowDefinition): string[] {
  const keywords = new Set<string>();

  // Add name words
  for (const word of definition.name.split(/[-_\s]+/)) {
    if (word.length > 2) {
      keywords.add(word.toLowerCase());
    }
  }

  // Add step action words
  for (const step of definition.steps) {
    for (const word of step.action.split(/[-_\s]+/)) {
      if (word.length > 2) {
        keywords.add(word.toLowerCase());
      }
    }
  }

  // Add agent roles
  for (const step of definition.steps) {
    keywords.add(step.agent.replace(/_/g, ' '));
  }

  return Array.from(keywords);
}
