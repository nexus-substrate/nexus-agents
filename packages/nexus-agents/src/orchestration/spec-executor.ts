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
import type { ParsedSpec } from './spec-parser-types.js';
import { decomposeSpec } from './spec-decomposer.js';
import { compileSpecToGraph } from './spec-pipeline.js';
import { executeGraph } from './graph/index.js';
import { validateScenario } from './scenario-validator.js';
import type {
  SpecExecutionResult,
  SpecExecutionError,
  SpecExecutionOptions,
} from './spec-executor-types.js';
import type { ScenarioResult } from './scenario-validator-types.js';

/** Executes a markdown specification end-to-end. */
export async function executeSpec(
  markdown: string,
  options?: SpecExecutionOptions
): Promise<Result<SpecExecutionResult, SpecExecutionError>> {
  const startTime = getTimeProvider().now();

  const parseResult = parseSpec(markdown);
  if (!parseResult.ok) return err({ message: parseResult.error.message, stage: 'parse' });
  const spec = parseResult.value;

  const dagResult = decomposeSpec(spec);
  if (!dagResult.ok) return err({ message: dagResult.error.message, stage: 'decompose' });

  const compileResult = compileSpecToGraph(markdown, options);
  if (!compileResult.ok) return err({ message: compileResult.error.message, stage: 'compile' });

  const execResult = await executeGraph(compileResult.value, { results: [] });
  if (!execResult.ok) return err({ message: execResult.error.message, stage: 'execute' });

  const outputs = extractOutputs(execResult.value.finalState);

  // A spec with no acceptance criteria has nothing to be validated against.
  // This used to short-circuit to satisfaction 1 / allMet true — a perfect
  // score for a check that never ran, which `execute_spec` then persisted as
  // a successful outcome and a learning (#4826). `validateScenario` already
  // refuses this input; the short-circuit was bypassing it.
  if (spec.acceptanceCriteria.length === 0) {
    return err({
      message:
        'Spec has no acceptance criteria, so the execution cannot be validated. ' +
        'Add an "## Acceptance Criteria" section.',
      stage: 'validate',
    });
  }

  const validation = validateOrErr(spec, outputs);
  if (validation === null) {
    return err({ message: 'Scenario validation failed', stage: 'validate' });
  }

  return ok({
    executed: compileResult.value.executed,
    dag: dagResult.value,
    outputs,
    validation,
    durationMs: getTimeProvider().now() - startTime,
  });
}

/** Validates scenario, returning result or null on error. */
function validateOrErr(spec: ParsedSpec, outputs: readonly string[]): ScenarioResult | null {
  const result = validateScenario(spec, outputs);
  return result.ok ? result.value : null;
}

/** Extracts string outputs from graph final state. */
function extractOutputs(state: Readonly<Record<string, unknown>>): string[] {
  const results = state['results'];
  if (!Array.isArray(results)) return [];
  return results.filter((r): r is string => typeof r === 'string');
}
