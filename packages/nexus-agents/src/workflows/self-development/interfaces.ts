/**
 * Self-Development Workflow Interfaces
 *
 * External interfaces for Git and GitHub operations.
 *
 * @module workflows/self-development/interfaces
 */

import type { IModelAdapter } from '../../core/index.js';
import type { TrinityCoordinator } from '../../agents/collaboration/trinity-coordinator.js';
import type { ReflexionProtocol } from '../../agents/collaboration/reflexion-protocol.js';
import type { ConsensusProtocol } from '../../agents/collaboration/collaboration-protocol.js';
import type { SelfDebugProtocol } from '../../agents/collaboration/self-debug-protocol.js';
import type { SelfRefineProtocol } from '../../agents/collaboration/self-refine-protocol.js';
import type { WorkflowPhase } from './types.js';

/**
 * Dependencies injected into the workflow engine.
 */
export interface SelfDevWorkflowDependencies {
  readonly modelAdapter: IModelAdapter;
  readonly trinity?: TrinityCoordinator;
  readonly reflexion?: ReflexionProtocol;
  readonly consensus?: ConsensusProtocol;
  readonly selfDebug?: SelfDebugProtocol;
  readonly selfRefine?: SelfRefineProtocol;
  readonly gitClient?: IGitClient;
  readonly githubClient?: IGitHubClient;
}

/**
 * Git operations interface.
 */
export interface IGitClient {
  createBranch(name: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  add(paths: string[]): Promise<void>;
  commit(message: string): Promise<string>;
  push(branch: string): Promise<void>;
  tag(name: string): Promise<void>;
  status(): Promise<string[]>;
}

/**
 * GitHub operations interface.
 */
export interface IGitHubClient {
  listIssues(labels?: string[]): Promise<GitHubIssue[]>;
  getIssue(number: number): Promise<GitHubIssue>;
  createPR(options: CreatePROptions): Promise<GitHubPR>;
  addComment(issueNumber: number, body: string): Promise<void>;
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
}

/**
 * GitHub issue representation.
 */
export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: string[];
  readonly author: string;
  readonly createdAt: string;
}

/**
 * GitHub PR creation options.
 */
export interface CreatePROptions {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
}

/**
 * GitHub PR representation.
 */
export interface GitHubPR {
  readonly number: number;
  readonly url: string;
}

/**
 * Workflow execution event.
 */
export interface WorkflowEvent {
  readonly type:
    | 'phase_started'
    | 'phase_completed'
    | 'phase_failed'
    | 'checkpoint_created'
    | 'human_review_required'
    | 'workflow_completed'
    | 'workflow_failed';
  readonly phase?: WorkflowPhase;
  readonly data?: unknown;
  readonly timestamp: string;
}

/**
 * Event listener for workflow events.
 */
export type WorkflowEventListener = (event: WorkflowEvent) => void;
