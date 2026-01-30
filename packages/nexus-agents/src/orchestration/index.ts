/**
 * nexus-agents/orchestration - Orchestration Module
 *
 * Unified orchestration layer providing canonical IOrchestrator interface
 * for all orchestration strategies (workflow, tech_lead, puppeteer).
 *
 * @module orchestration
 * @see docs/adr/0002-orchestrator-interface.md
 */

// Factory and adapters
export {
  OrchestratorFactory,
  WorkflowOrchestratorAdapter,
  createOrchestratorFactory,
  type OrchestratorFactoryConfig,
  type WorkflowAdapterConfig,
} from './orchestrator-factory.js';

// Re-export types from core for convenience
export type {
  IOrchestrator,
  IOrchestratorFactory,
  OrchestratorType,
  OrchestratorDefinition,
  OrchestratorExecuteOptions,
  OrchestratorStep,
  OrchestratorResult,
  OrchestratorErrorCode,
} from '../core/types/orchestrator.js';
export { OrchestratorError } from '../core/types/orchestrator.js';
