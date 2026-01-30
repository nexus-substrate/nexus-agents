/**
 * Self-Development Workflow Dependencies Factory
 *
 * Factory function to create SelfDevWorkflowDependencies with real protocol
 * implementations when a model adapter is available.
 *
 * @module workflows/self-development/deps-factory
 * (Source: Issue #494 - Wire self-development workflow dependencies)
 */

import type { ILogger, IModelAdapter } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import type { SelfDevWorkflowDependencies } from './interfaces.js';
import { createTrinityCoordinator } from '../../agents/collaboration/trinity-coordinator.js';
import { createReflexionProtocol } from '../../agents/collaboration/reflexion-protocol.js';
import { createSelfDebugProtocol } from '../../agents/collaboration/self-debug-protocol.js';
import { createSelfRefineProtocol } from '../../agents/collaboration/self-refine-protocol.js';
import { ConsensusProtocol } from '../../agents/collaboration/collaboration-protocol.js';
import { createAuditTrail } from './audit-trail.js';
import { createNotificationService } from './notifications.js';
import { createGitClient } from './git-client.js';
import { createGitHubClient } from './github-client.js';

/**
 * Configuration for creating self-development dependencies.
 */
export interface SelfDevDepsConfig {
  /** Model adapter for LLM calls (required for real execution) */
  modelAdapter?: IModelAdapter | undefined;
  /** Logger instance */
  logger?: ILogger | undefined;
  /** Fail fast instead of using fallbacks when dependencies unavailable */
  failFast?: boolean | undefined;
  /** Working directory for git operations */
  workingDir?: string | undefined;
  /** GitHub repository owner/name */
  repository?: string | undefined;
}

/**
 * Result of dependency factory creation.
 */
export interface SelfDevDepsResult {
  /** Created dependencies */
  deps: SelfDevWorkflowDependencies;
  /** Which dependencies are using real implementations vs fallbacks */
  status: {
    /** True if model adapter is available */
    modelAdapter: boolean;
    /** True if trinity coordinator is available */
    trinity: boolean;
    /** True if reflexion protocol is available */
    reflexion: boolean;
    /** True if consensus protocol is available */
    consensus: boolean;
    /** True if self-debug protocol is available */
    selfDebug: boolean;
    /** True if self-refine protocol is available */
    selfRefine: boolean;
    /** True if git client is available */
    gitClient: boolean;
    /** True if github client is available */
    githubClient: boolean;
  };
  /** Warnings about fallback usage */
  warnings: string[];
}

/** Generates a unique execution ID. */
function generateExecutionId(): string {
  return `selfdev-${String(getTimeProvider().now())}`;
}

/** Builds status object based on config. */
function buildStatus(
  modelAdapter: IModelAdapter | undefined,
  workingDir: string | undefined,
  repository: string | undefined
): SelfDevDepsResult['status'] {
  const hasAdapter = modelAdapter !== undefined;
  return {
    modelAdapter: hasAdapter,
    trinity: hasAdapter,
    reflexion: hasAdapter,
    consensus: hasAdapter,
    selfDebug: hasAdapter,
    selfRefine: hasAdapter,
    gitClient: workingDir !== undefined,
    githubClient: repository !== undefined,
  };
}

/** Builds dependencies object. */
function buildDeps(
  modelAdapter: IModelAdapter | undefined,
  workingDir: string | undefined,
  repository: string | undefined
): SelfDevWorkflowDependencies {
  const executionId = generateExecutionId();
  return {
    modelAdapter: modelAdapter as IModelAdapter,
    ...(modelAdapter !== undefined && {
      trinity: createTrinityCoordinator(),
      reflexion: createReflexionProtocol(),
      consensus: new ConsensusProtocol(),
      selfDebug: createSelfDebugProtocol(),
      selfRefine: createSelfRefineProtocol(),
    }),
    ...(workingDir !== undefined && { gitClient: createGitClient(workingDir) }),
    ...(repository !== undefined && { githubClient: createGitHubClient(repository) }),
    auditTrail: createAuditTrail(executionId),
    notifications: createNotificationService(true),
  };
}

/**
 * Creates self-development workflow dependencies.
 *
 * When a model adapter is provided, creates real protocol implementations.
 * Otherwise, dependencies are undefined and the workflow will use fallbacks.
 *
 * @param config - Configuration options
 * @returns Dependencies and status information
 */
export function createSelfDevDeps(config: SelfDevDepsConfig = {}): SelfDevDepsResult {
  const logger = config.logger ?? createLogger({ component: 'SelfDevDeps' });
  const { modelAdapter, failFast, workingDir, repository } = config;
  const warnings: string[] = [];

  if (modelAdapter === undefined) {
    const msg = 'No model adapter provided - workflow will use fallback heuristics';
    warnings.push(msg);
    if (failFast === true) throw new Error(msg);
    logger.warn(msg);
  }
  if (workingDir === undefined) warnings.push('No workingDir - git fallback');
  if (repository === undefined) warnings.push('No repository - GitHub fallback');

  const status = buildStatus(modelAdapter, workingDir, repository);
  const deps = buildDeps(modelAdapter, workingDir, repository);

  logger.info('Self-development dependencies created', {
    hasModelAdapter: modelAdapter !== undefined,
    protocolsAvailable: Object.values(status).filter(Boolean).length,
  });

  return { deps, status, warnings };
}

/**
 * Checks if all required dependencies are available for real execution.
 *
 * @param status - Status from createSelfDevDeps
 * @returns True if all critical dependencies are available
 */
export function hasRealExecution(status: SelfDevDepsResult['status']): boolean {
  // Trinity, reflexion, and consensus are the critical protocols
  return status.trinity && status.reflexion && status.consensus;
}
