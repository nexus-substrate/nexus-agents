/**
 * AOrchestra — Dynamic Sub-Agent Creation
 *
 * Task-adaptive expert team composition based on SharedTaskAnalyzer output.
 * Selects optimal experts from 9 built-in types based on task characteristics.
 *
 * (Source: arXiv:2602.03786 — AOrchestra)
 * @module orchestration/aorchestra
 */

export { planAgentTeam, MAX_WORKERS_PER_WAVE } from './agent-planner.js';
export type { AgentPlan, AgentPlanEntry } from './agent-planner.js';
export { dispatchWorkers, groupByWave } from './worker-dispatcher.js';
export type { WorkerResult, WorkerDispatchOptions } from './worker-dispatcher.js';
