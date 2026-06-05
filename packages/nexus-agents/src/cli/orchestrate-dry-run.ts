/**
 * Enriched dry-run output for the orchestrate command.
 *
 * Produces a task analysis report showing what nexus-agents WOULD do,
 * including complexity estimate, detected category, estimated tokens,
 * and cost projection against the canonical model registry.
 *
 * @module cli/orchestrate-dry-run
 * (Source: Issue #1946)
 */

import type { CliTask } from '../cli-adapters/index.js';
import type { CompositeRoutingDecision } from '../cli-adapters/index.js';
import { routingArmDisplaySlot } from '../cli-adapters/index.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import { calculateCost } from '../core/index.js';
import { getCliModelName, getDefaultModelForCli } from '../config/model-config-helpers.js';

/** Estimated output tokens as a fraction of input tokens (typical LLM ratio). */
const DEFAULT_OUTPUT_RATIO = 0.6;

/** Structured dry-run report. */
export interface DryRunReport {
  readonly analysis: {
    readonly taskType: string;
    readonly taskTypeConfidence: number;
    readonly reasoningType: string;
    readonly reasoningConfidence: number;
    readonly complexity: string;
    readonly complexityScore: number;
    readonly estimatedInputTokens: number;
    readonly estimatedOutputTokens: number;
  };
  readonly costEstimate:
    | {
        readonly model: string;
        readonly inputUsd: number;
        readonly outputUsd: number;
        readonly totalUsd: number;
      }
    | undefined;
  readonly routing: {
    readonly selectedCli: string;
    readonly modelId: string;
    readonly reason: string;
    readonly confidence: number;
  };
}

/**
 * Build an enriched dry-run report for the given task + routing decision.
 */
export function buildDryRunReport(task: CliTask, decision: CompositeRoutingDecision): DryRunReport {
  const analyzer = createSharedTaskAnalyzer();
  // Analyzer accepts task content string or a full Task; pass content string.
  const analysis = analyzer.analyze(task.content);
  const estimatedInputTokens = analyzer.estimateTokens(task.content);
  const estimatedOutputTokens = Math.round(estimatedInputTokens * DEFAULT_OUTPUT_RATIO);

  // Registry model lookup is slot-level; collapse an api:* arm to its slot (#3422).
  const modelId = getCliModelName(getDefaultModelForCli(routingArmDisplaySlot(decision.cliName)));
  const costUsd = calculateCost(modelId, estimatedInputTokens, estimatedOutputTokens);
  const inputCostUsd = calculateCost(modelId, estimatedInputTokens, 0);
  const outputCostUsd = calculateCost(modelId, 0, estimatedOutputTokens);

  return {
    analysis: {
      taskType: analysis.taskType,
      taskTypeConfidence: analysis.taskTypeConfidence,
      reasoningType: analysis.reasoningType,
      reasoningConfidence: analysis.reasoningConfidence,
      complexity: analysis.complexity,
      complexityScore: analysis.complexityScore,
      estimatedInputTokens,
      estimatedOutputTokens,
    },
    costEstimate:
      costUsd !== undefined && inputCostUsd !== undefined && outputCostUsd !== undefined
        ? {
            model: modelId,
            inputUsd: inputCostUsd,
            outputUsd: outputCostUsd,
            totalUsd: costUsd,
          }
        : undefined,
    routing: {
      selectedCli: decision.cliName,
      modelId,
      reason: decision.reason,
      confidence: decision.confidence,
    },
  };
}

/** Render the dry-run report as human-readable text. */
export function renderDryRunText(report: DryRunReport): string {
  const lines: string[] = ['[DRY RUN] Task would execute with the following plan:', ''];

  lines.push('Task Analysis:');
  lines.push(
    `  Category:       ${report.analysis.taskType} (confidence: ${formatPct(report.analysis.taskTypeConfidence)})`
  );
  lines.push(
    `  Reasoning type: ${report.analysis.reasoningType} (confidence: ${formatPct(report.analysis.reasoningConfidence)})`
  );
  lines.push(
    `  Complexity:     ${report.analysis.complexity} (score: ${report.analysis.complexityScore.toFixed(2)})`
  );
  lines.push(
    `  Est. tokens:    ~${String(report.analysis.estimatedInputTokens)} input / ~${String(report.analysis.estimatedOutputTokens)} output`
  );

  if (report.costEstimate !== undefined) {
    lines.push('');
    lines.push('Cost Estimate:');
    lines.push(`  Model:  ${report.costEstimate.model}`);
    lines.push(
      `  Input:  $${report.costEstimate.inputUsd.toFixed(6)} · Output: $${report.costEstimate.outputUsd.toFixed(6)}`
    );
    lines.push(`  Total:  $${report.costEstimate.totalUsd.toFixed(6)}`);
  }

  lines.push('');
  lines.push('Routing:');
  lines.push(`  Selected:   ${report.routing.selectedCli} (${report.routing.modelId})`);
  lines.push(`  Reason:     ${report.routing.reason}`);
  lines.push(`  Confidence: ${formatPct(report.routing.confidence)}`);

  lines.push('');
  lines.push('Run without --dry-run to execute.');
  return lines.join('\n');
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
