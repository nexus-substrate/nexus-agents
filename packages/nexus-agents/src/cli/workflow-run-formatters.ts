/**
 * nexus-agents/cli - Workflow Run Formatters
 *
 * Output formatting and printing for the workflow run CLI command.
 *
 * @module cli/workflow-run-formatters
 * (Source: Issue #67, extracted from workflow-run.ts for #272)
 */

import type { WorkflowDefinition } from '../core/index.js';
import type { TemplateMetadata } from '../workflows/index.js';
import { colors, type WorkflowRunResult } from './workflow-run-types.js';

/**
 * Writes a line to stdout.
 */
function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

/**
 * Formats a step for display.
 */
export function formatStep(
  step: { id: string; agent: string; action: string },
  index: number
): string {
  const num = String(index + 1).padStart(2, ' ');
  return `  ${num}. ${colors.cyan}${step.id}${colors.reset} → ${step.agent}::${step.action}`;
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
 * Prints available workflow templates.
 */
export function printWorkflowTemplateList(templates: TemplateMetadata[]): void {
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
