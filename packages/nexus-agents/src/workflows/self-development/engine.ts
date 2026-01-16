/**
 * Self-Development Workflow Engine
 *
 * Orchestrates the meta-workflow for nexus-agents self-improvement.
 * Uses existing protocols: TRINITY, Reflexion, Consensus, Self-Debug, Self-Refine.
 *
 * @module workflows/self-development/engine
 * @see docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md
 */

import { randomUUID } from 'node:crypto';
import type {
  ISelfDevWorkflowEngine,
  SelfDevWorkflowConfig,
  SelfDevWorkflowState,
  SelfDevWorkflowResult,
  HumanDecision,
  ReviewOutput,
} from './types.js';
import type { SelfDevWorkflowDependencies, WorkflowEventListener } from './interfaces.js';
import {
  executeAnalyze,
  executeResearch,
  executePlan,
  executeRefine,
  executeVote,
  executeImplement,
  executeVerify,
  executeCommit,
} from './phase-executors.js';
import { AuditTrail, createAuditTrail } from './audit-trail.js';
import {
  emitEvent,
  updatePhase,
  updateStatus,
  createCheckpoint,
  completeWorkflow,
  failWorkflow,
  type EngineStateContainer,
} from './engine-helpers.js';

// Re-export interfaces
export type {
  SelfDevWorkflowDependencies,
  IGitClient,
  IGitHubClient,
  GitHubIssue,
  GitHubPR,
  CreatePROptions,
  WorkflowEvent,
  WorkflowEventListener,
} from './interfaces.js';

// Re-export helpers for backward compatibility
export {
  emitEvent,
  updatePhase,
  updateStatus,
  createCheckpoint,
  completeWorkflow,
  failWorkflow,
  type EngineStateContainer,
} from './engine-helpers.js';

/** Self-Development Workflow Engine - orchestrates the meta-workflow for self-improvement. */
export class SelfDevWorkflowEngine implements ISelfDevWorkflowEngine {
  private readonly states = new Map<string, SelfDevWorkflowState>();
  private readonly results = new Map<string, SelfDevWorkflowResult>();
  private readonly auditTrails = new Map<string, AuditTrail>();
  private readonly listeners: WorkflowEventListener[] = [];
  private readonly pendingReviews = new Map<
    string,
    (decision: HumanDecision, feedback?: string) => void
  >();

  constructor(private readonly deps: SelfDevWorkflowDependencies) {}

  /** Get the state container for helper functions. */
  private getContainer(): EngineStateContainer {
    return {
      states: this.states,
      results: this.results,
      auditTrails: this.auditTrails,
      listeners: this.listeners,
    };
  }

  /** Get audit trail for an execution. */
  getAuditTrail(executionId: string): AuditTrail | undefined {
    return this.auditTrails.get(executionId);
  }

  addEventListener(listener: WorkflowEventListener): void {
    this.listeners.push(listener);
  }

  removeEventListener(listener: WorkflowEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  start(config: SelfDevWorkflowConfig): Promise<SelfDevWorkflowState> {
    const executionId = randomUUID();
    const now = new Date().toISOString();

    // Create audit trail for this execution
    const auditTrail = this.deps.auditTrail ?? createAuditTrail(executionId);
    this.auditTrails.set(executionId, auditTrail);

    const state: SelfDevWorkflowState = {
      executionId,
      config,
      currentPhase: 'analyze',
      checkpoints: [],
      startedAt: now,
      status: 'running',
    };

    this.states.set(executionId, state);
    emitEvent(this.listeners, { type: 'phase_started', phase: 'analyze', timestamp: now });

    // Record workflow start and begin async execution
    void auditTrail.phaseStarted('analyze');
    void this.executeWorkflow(executionId);

    return Promise.resolve(state);
  }

  resume(executionId: string): Promise<SelfDevWorkflowState> {
    const state = this.states.get(executionId);
    if (state === undefined) {
      return Promise.reject(new Error(`Workflow ${executionId} not found`));
    }

    if (state.status !== 'paused') {
      return Promise.reject(
        new Error(`Workflow ${executionId} is not paused (status: ${state.status})`)
      );
    }

    const updatedState: SelfDevWorkflowState = { ...state, status: 'running' };
    this.states.set(executionId, updatedState);

    void this.executeWorkflow(executionId);
    return Promise.resolve(updatedState);
  }

  getState(executionId: string): SelfDevWorkflowState | undefined {
    return this.states.get(executionId);
  }

  cancel(executionId: string, reason: string): Promise<void> {
    const state = this.states.get(executionId);
    if (state === undefined) {
      return Promise.reject(new Error(`Workflow ${executionId} not found`));
    }

    const updatedState: SelfDevWorkflowState = { ...state, status: 'cancelled' };
    this.states.set(executionId, updatedState);

    emitEvent(this.listeners, {
      type: 'workflow_failed',
      data: { reason },
      timestamp: new Date().toISOString(),
    });
    return Promise.resolve();
  }

  submitReview(executionId: string, decision: HumanDecision, feedback?: string): Promise<void> {
    const resolver = this.pendingReviews.get(executionId);
    if (resolver === undefined) {
      return Promise.reject(new Error(`No pending review for workflow ${executionId}`));
    }

    resolver(decision, feedback);
    this.pendingReviews.delete(executionId);
    return Promise.resolve();
  }

  getResult(executionId: string): SelfDevWorkflowResult | undefined {
    return this.results.get(executionId);
  }

  // =========================================================================
  // Private execution methods
  // =========================================================================

  private async executeWorkflow(executionId: string): Promise<void> {
    const state = this.states.get(executionId);
    if (state === undefined) return;

    const startTime = Date.now();

    try {
      const outputs = await this.runAllPhases(executionId, state);
      completeWorkflow(
        this.getContainer(),
        executionId,
        outputs,
        startTime,
        this.deps.notifications
      );
    } catch (error) {
      failWorkflow(this.getContainer(), executionId, error, startTime, this.deps.notifications);
    }
  }

  private async runAllPhases(
    executionId: string,
    state: SelfDevWorkflowState
  ): Promise<SelfDevWorkflowResult['outputs']> {
    // Run phases 1-6 (through human review)
    const preReview = await this.runPreReviewPhases(executionId, state);
    // Run phases 7-9 (implementation through commit)
    return await this.runPostReviewPhases(executionId, state, preReview);
  }

  private async runPreReviewPhases(
    executionId: string,
    state: SelfDevWorkflowState
  ): Promise<SelfDevWorkflowResult['outputs']> {
    const outputs: SelfDevWorkflowResult['outputs'] = {};
    const container = this.getContainer();

    const analyzeOut = await executeAnalyze(this.deps, state);
    createCheckpoint(container, executionId, 'analyze', analyzeOut);
    updatePhase(container, executionId, 'research');
    (outputs as { analyze: typeof analyzeOut }).analyze = analyzeOut;

    const researchOut = await executeResearch(this.deps, state, analyzeOut);
    createCheckpoint(container, executionId, 'research', researchOut);
    updatePhase(container, executionId, 'plan');
    (outputs as { research: typeof researchOut }).research = researchOut;

    const planOut = await executePlan(this.deps, state, analyzeOut, researchOut);
    createCheckpoint(container, executionId, 'plan', planOut);
    updatePhase(container, executionId, 'refine');
    (outputs as { plan: typeof planOut }).plan = planOut;

    const refineOut = await executeRefine(this.deps, state, planOut);
    createCheckpoint(container, executionId, 'refine', refineOut);
    updatePhase(container, executionId, 'vote');
    (outputs as { refine: typeof refineOut }).refine = refineOut;

    const voteOut = await executeVote(this.deps, state, refineOut);
    createCheckpoint(container, executionId, 'vote', voteOut);
    if (voteOut.verdict !== 'APPROVED') {
      throw new Error(`Consensus rejected: ${voteOut.verdict}`);
    }
    updatePhase(container, executionId, 'review');
    (outputs as { vote: typeof voteOut }).vote = voteOut;

    const reviewOut = await this.executeReview(executionId);
    createCheckpoint(container, executionId, 'review', reviewOut);
    if (reviewOut.decision !== 'approved') {
      throw new Error(`Human review ${reviewOut.decision}: ${reviewOut.feedback ?? 'No feedback'}`);
    }
    updatePhase(container, executionId, 'implement');
    (outputs as { review: typeof reviewOut }).review = reviewOut;

    return outputs;
  }

  private async runPostReviewPhases(
    executionId: string,
    state: SelfDevWorkflowState,
    outputs: SelfDevWorkflowResult['outputs']
  ): Promise<SelfDevWorkflowResult['outputs']> {
    const refineOut = outputs.refine;
    if (refineOut === undefined) throw new Error('Refine output missing');
    const container = this.getContainer();

    const implementOut = await executeImplement(this.deps, state, refineOut);
    createCheckpoint(container, executionId, 'implement', implementOut);
    if (!implementOut.success) {
      throw new Error(`Implementation failed: ${implementOut.summary}`);
    }
    updatePhase(container, executionId, 'verify');
    (outputs as { implement: typeof implementOut }).implement = implementOut;

    const verifyOut = await executeVerify(this.deps, state);
    createCheckpoint(container, executionId, 'verify', verifyOut);
    if (!verifyOut.allPassed) {
      throw new Error(`Verification failed: ${verifyOut.failureReport ?? 'Unknown'}`);
    }
    updatePhase(container, executionId, 'commit');
    (outputs as { verify: typeof verifyOut }).verify = verifyOut;

    const commitOut = await executeCommit(this.deps, state, outputs);
    createCheckpoint(container, executionId, 'commit', commitOut);
    (outputs as { commit: typeof commitOut }).commit = commitOut;

    return outputs;
  }

  private async executeReview(executionId: string): Promise<ReviewOutput> {
    const startTime = Date.now();

    updateStatus(this.states, executionId, 'paused');
    emitEvent(this.listeners, {
      type: 'human_review_required',
      data: { executionId },
      timestamp: new Date().toISOString(),
    });
    void this.deps.notifications?.reviewRequired(executionId);

    const result = await new Promise<{ decision: HumanDecision; feedback: string | undefined }>(
      (resolve) => {
        this.pendingReviews.set(executionId, (d, f) => {
          resolve({ decision: d, feedback: f });
        });
      }
    );

    const output: ReviewOutput = {
      decision: result.decision,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    return result.feedback !== undefined ? { ...output, feedback: result.feedback } : output;
  }
}

/**
 * Create a new SelfDevWorkflowEngine instance.
 */
export function createSelfDevWorkflowEngine(
  deps: SelfDevWorkflowDependencies
): SelfDevWorkflowEngine {
  return new SelfDevWorkflowEngine(deps);
}
