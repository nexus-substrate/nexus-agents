/**
 * @nexus-agents/workflows - Template Loader
 *
 * Utilities for loading and parsing YAML workflow templates.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Result } from '@nexus-agents/core';
import { ParseError } from '@nexus-agents/core';
import type { WorkflowDefinition } from '@nexus-agents/core';
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
 * @returns Result with ParsedTemplate or ParseError
 */
export async function loadTemplateFile(
  filePath: string
): Promise<Result<ParsedTemplate, ParseError>> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parseResult = parseTemplateContent(content, filePath);

    if (!parseResult.ok) {
      return parseResult;
    }

    const definition = parseResult.value;
    const templateName = basename(filePath, extname(filePath));
    const isBuiltIn = BUILT_IN_TEMPLATES.includes(templateName as BuiltInTemplateName);

    const metadata: TemplateMetadata = {
      name: definition.name,
      version: definition.version,
      path: filePath,
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
        error: new ParseError(`Failed to read ${filePath}: ${error.message}`),
      };
    }
    return {
      ok: false,
      error: new ParseError(`Unknown error reading ${filePath}`),
    };
  }
}

/**
 * Load all templates from a directory.
 * @param directoryPath - Path to directory containing YAML templates
 * @returns Array of successfully loaded templates
 */
export async function loadTemplatesFromDirectory(
  directoryPath: string
): Promise<{ templates: ParsedTemplate[]; errors: ParseError[] }> {
  const templates: ParsedTemplate[] = [];
  const errors: ParseError[] = [];

  try {
    const stats = await stat(directoryPath);
    if (!stats.isDirectory()) {
      errors.push(new ParseError(`${directoryPath} is not a directory`));
      return { templates, errors };
    }

    const entries = await readdir(directoryPath);

    for (const entry of entries) {
      if (!isYamlFile(entry)) {
        continue;
      }

      const filePath = join(directoryPath, entry);
      const result = await loadTemplateFile(filePath);

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
