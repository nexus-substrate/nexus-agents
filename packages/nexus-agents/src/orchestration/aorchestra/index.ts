/**
 * AOrchestra — Dynamic Sub-Agent Creation
 *
 * Task-adaptive expert team composition based on SharedTaskAnalyzer output.
 * Selects optimal experts from 9 built-in types based on task characteristics.
 *
 * (Source: arXiv:2602.03786 — AOrchestra)
 * @module orchestration/aorchestra
 */

export {
  planAgentTeam,
  MAX_WORKERS_PER_WAVE,
  EXPERT_DEPENDENCIES,
  computeOptimalWaveSize,
} from './agent-planner.js';
export type { AgentPlan, AgentPlanEntry, PlanAgentTeamOptions } from './agent-planner.js';
export { dispatchWorkers, groupByWave, WORKER_TIMEOUT_MS } from './worker-dispatcher.js';
export type { WorkerResult, WorkerDispatchOptions, WorkerErrorType } from './worker-dispatcher.js';
export { composeWorkerPrompt } from './compose-worker-prompt.js';
export type { ComposeWorkerPromptInput } from './compose-worker-prompt.js';
export { detectConflicts } from './conflict-detector.js';
export type { WorkerConflict } from './conflict-detector.js';
export { matchTriggers, DEFAULT_TRIGGER_TABLE } from './trigger-table.js';
export type { TriggerRule } from './trigger-table.js';
export {
  isContextFresh,
  markContextVerified,
  getContextAge,
  DEFAULT_TTL_MS,
} from './context-freshness.js';
export type { ContextEntry } from './context-freshness.js';
export {
  sanitizeWorkerOutput,
  buildPriorWaveContextBlock,
  MAX_PRIOR_CONTEXT_CHARS,
  MAX_CHARS_PER_WORKER,
} from './cross-wave-context.js';
export {
  synthesizeResults,
  buildSynthesisPrompt,
  MAX_SYNTHESIS_INPUT_CHARS,
  SYNTHESIS_MAX_TOKENS,
} from './result-synthesizer.js';
export type {
  SynthesizeResultsInput,
  SynthesisResult,
  SynthesisPromptInput,
  SynthesisSource,
} from './result-synthesizer.js';
