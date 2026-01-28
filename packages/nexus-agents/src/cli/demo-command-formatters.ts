/**
 * Demo Command Formatters
 *
 * Output formatting functions for the demo command.
 *
 * @module cli/demo-command-formatters
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */

import { DEFAULT_EXPERTS } from '../agents/experts/expert-defaults.js';
import type { MockRoutingResult, MockWorkflow } from './demo-command-types.js';
import { colors } from './demo-command-types.js';

// ============================================================================
// Routing Demo Formatting
// ============================================================================

/**
 * Formats TOPSIS ranking table rows.
 */
function formatTopsisRows(topsisRanking: MockRoutingResult['topsisRanking']): string[] {
  const lines: string[] = [];
  const header =
    '  ' +
    'Model'.padEnd(8) +
    ' ' +
    'Score'.padStart(6) +
    ' ' +
    'Quality'.padStart(8) +
    ' ' +
    'Cost'.padStart(6) +
    ' ' +
    'Latency'.padStart(8);
  lines.push(header);
  lines.push('  ' + '-'.repeat(44));
  for (const score of topsisRanking) {
    const row =
      '  ' +
      score.model.padEnd(8) +
      ' ' +
      score.score.toFixed(2).padStart(6) +
      ' ' +
      score.quality.toFixed(1).padStart(8) +
      ' ' +
      score.cost.toFixed(1).padStart(6) +
      ' ' +
      score.latency.toFixed(1).padStart(8);
    lines.push(row);
  }
  return lines;
}

/**
 * Formats budget filter results.
 */
function formatBudgetResults(budgetResults: MockRoutingResult['budgetResults']): string[] {
  const lines: string[] = [];
  for (const br of budgetResults) {
    const status = br.withinBudget
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.yellow}FAIL${colors.reset}`;
    lines.push(`  ${br.model.padEnd(8)} ${status} - ${br.reason}`);
  }
  return lines;
}

/**
 * Formats the routing demo output.
 */
export function formatRoutingDemo(result: MockRoutingResult): string {
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
  lines.push(...formatBudgetResults(result.budgetResults));
  lines.push('');

  // TOPSIS Ranking
  lines.push(`${colors.bold}TOPSIS Ranking:${colors.reset}`);
  lines.push(...formatTopsisRows(result.topsisRanking));
  lines.push('');

  // Selection
  lines.push(`${colors.bold}${colors.green}Selected: ${result.selectedModel}${colors.reset}`);
  lines.push(`Reason: ${result.selectionReason}`);
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Expert List Demo Formatting
// ============================================================================

/**
 * Formats the expert list demo output.
 */
export function formatExpertListDemo(): string {
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

// ============================================================================
// Workflow Demo Formatting
// ============================================================================

/**
 * Formats the workflow demo output.
 */
export function formatWorkflowDemo(workflow: MockWorkflow): string {
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
  lines.push('  1. Workflow validates all required inputs');
  lines.push('  2. Steps execute in order (parallel steps run together)');
  lines.push('  3. Each step invokes the specified expert agent');
  lines.push('  4. Results are passed to dependent steps');
  lines.push('  5. Final output is aggregated and returned');
  lines.push('');

  const hint = `Use "nexus-agents workflow run ${workflow.name} --dry-run" with API for full validation`;
  lines.push(`${colors.dim}${hint}${colors.reset}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the available workflows list.
 */
export function formatAvailableWorkflows(
  workflows: Array<{ name: string; description: string }>
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${colors.cyan}${colors.bold}=== Available Workflows ===${colors.reset}`);
  lines.push(
    `${colors.dim}(Use "nexus-agents demo workflow <name>" to see details)${colors.reset}`
  );
  lines.push('');

  for (const workflow of workflows) {
    lines.push(`  ${colors.cyan}${workflow.name}${colors.reset}`);
    lines.push(`    ${workflow.description}`);
    lines.push('');
  }

  lines.push(
    `${colors.dim}Use "nexus-agents workflow list" for all available workflows${colors.reset}`
  );
  lines.push('');

  return lines.join('\n');
}
