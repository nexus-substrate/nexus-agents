/**
 * Spec Executor — end-to-end spec execution with validation.
 *
 * Takes raw markdown, compiles to a graph, executes it, and
 * validates results against acceptance criteria.
 *
 * @module orchestration/spec-executor
 * (Source: Issue #851 — Phase 3 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok, err, getTimeProvider } from '../core/index.js';
import { parseSpec } from './spec-parser.js';
import { decomposeSpec } from './spec-decomposer.js';
import { compileSpecToGraph } from './spec-pipeline.js';
import { executeGraph } from './graph/index.js';
import { validateScenario } from './scenario-validator.js';
import type { SpecExecutionResult, SpecExecutionError } from './spec-executor-types.js';

/**
 * Executes a markdown specification end-to-end.
 *
 * Pipeline: markdown → parse → decompose → compile → execute → validate
 */
export async function executeSpec(
  markdown: string
): Promise<Result<SpecExecutionResult, SpecExecutionError>> {
  const startTime = getTimeProvider().now();

  // Parse
  const parseResult = parseSpec(markdown);
  if (!parseResult.ok) {
    return err({ message: parseResult.error.message, stage: 'parse' });
  }
  const spec = parseResult.value;

  // Decompose
  const dagResult = decomposeSpec(spec);
  if (!dagResult.ok) {
    return err({ message: dagResult.error.message, stage: 'decompose' });
  }

  // Compile
  const compileResult = compileSpecToGraph(markdown);
  if (!compileResult.ok) {
    return err({ message: compileResult.error.message, stage: 'compile' });
  }

  // Execute
  const execResult = await executeGraph(compileResult.value, { results: [] });
  if (!execResult.ok) {
    return err({ message: execResult.error.message, stage: 'execute' });
  }

  // Extract outputs from final state
  const finalState = execResult.value.finalState;
  const outputs = extractOutputs(finalState);

  // Validate (only if there are acceptance criteria)
  if (spec.acceptanceCriteria.length === 0) {
    const durationMs = getTimeProvider().now() - startTime;
    return ok({
      dag: dagResult.value,
      outputs,
      validation: {
        satisfaction: 1,
        totalCriteria: 0,
        metCount: 0,
        criteria: [],
        allMet: true,
      },
      durationMs,
    });
  }

  const validationResult = validateScenario(spec, outputs);
  if (!validationResult.ok) {
    return err({ message: validationResult.error.message, stage: 'validate' });
  }

  const durationMs = getTimeProvider().now() - startTime;
  return ok({
    dag: dagResult.value,
    outputs,
    validation: validationResult.value,
    durationMs,
  });
}

/** Extracts string outputs from graph final state. */
function extractOutputs(state: Readonly<Record<string, unknown>>): string[] {
  const results = state['results'];
  if (!Array.isArray(results)) return [];
  return results.filter((r): r is string => typeof r === 'string');
}
