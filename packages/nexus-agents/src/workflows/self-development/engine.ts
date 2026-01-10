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
  WorkflowPhase,
  WorkflowCheckpoint,
  ReviewOutput,
} from './types.js';
import type {
  SelfDevWorkflowDependencies,
  WorkflowEvent,
  WorkflowEventListener,
} from './interfaces.js';
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
import { calculateMetrics } from './metrics.js';
import { AuditTrail, createAuditTrail } from './audit-trail.js';

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
    this.emit({ type: 'phase_started', phase: 'analyze', timestamp: now });

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

    this.emit({ type: 'workflow_failed', data: { reason }, timestamp: new Date().toISOString() });
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

  private emit(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private async executeWorkflow(executionId: string): Promise<void> {
    const state = this.states.get(executionId);
    if (state === undefined) return;

    const startTime = Date.now();

    try {
      const outputs = await this.runAllPhases(executionId, state);
      this.completeWorkflow(executionId, outputs, startTime);
    } catch (error) {
      this.failWorkflow(executionId, error, startTime);
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

    const analyzeOut = await executeAnalyze(this.deps, state);
    this.createCheckpoint(executionId, 'analyze', analyzeOut);
    this.updatePhase(executionId, 'research');
    (outputs as { analyze: typeof analyzeOut }).analyze = analyzeOut;

    const researchOut = await executeResearch(this.deps, state, analyzeOut);
    this.createCheckpoint(executionId, 'research', researchOut);
    this.updatePhase(executionId, 'plan');
    (outputs as { research: typeof researchOut }).research = researchOut;

    const planOut = await executePlan(this.deps, state, analyzeOut, researchOut);
    this.createCheckpoint(executionId, 'plan', planOut);
    this.updatePhase(executionId, 'refine');
    (outputs as { plan: typeof planOut }).plan = planOut;

    const refineOut = await executeRefine(this.deps, state, planOut);
    this.createCheckpoint(executionId, 'refine', refineOut);
    this.updatePhase(executionId, 'vote');
    (outputs as { refine: typeof refineOut }).refine = refineOut;

    const voteOut = await executeVote(this.deps, state, refineOut);
    this.createCheckpoint(executionId, 'vote', voteOut);
    if (voteOut.verdict !== 'APPROVED') {
      throw new Error(`Consensus rejected: ${voteOut.verdict}`);
    }
    this.updatePhase(executionId, 'review');
    (outputs as { vote: typeof voteOut }).vote = voteOut;

    const reviewOut = await this.executeReview(executionId);
    this.createCheckpoint(executionId, 'review', reviewOut);
    if (reviewOut.decision !== 'approved') {
      throw new Error(`Human review ${reviewOut.decision}: ${reviewOut.feedback ?? 'No feedback'}`);
    }
    this.updatePhase(executionId, 'implement');
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

    const implementOut = await executeImplement(this.deps, state, refineOut);
    this.createCheckpoint(executionId, 'implement', implementOut);
    if (!implementOut.success) {
      throw new Error(`Implementation failed: ${implementOut.summary}`);
    }
    this.updatePhase(executionId, 'verify');
    (outputs as { implement: typeof implementOut }).implement = implementOut;

    const verifyOut = await executeVerify(this.deps, state);
    this.createCheckpoint(executionId, 'verify', verifyOut);
    if (!verifyOut.allPassed) {
      throw new Error(`Verification failed: ${verifyOut.failureReport ?? 'Unknown'}`);
    }
    this.updatePhase(executionId, 'commit');
    (outputs as { verify: typeof verifyOut }).verify = verifyOut;

    const commitOut = await executeCommit(this.deps, state, outputs);
    this.createCheckpoint(executionId, 'commit', commitOut);
    (outputs as { commit: typeof commitOut }).commit = commitOut;

    return outputs;
  }

  private async executeReview(executionId: string): Promise<ReviewOutput> {
    const startTime = Date.now();

    this.updateStatus(executionId, 'paused');
    this.emit({
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

  private completeWorkflow(
    executionId: string,
    outputs: SelfDevWorkflowResult['outputs'],
    startTime: number
  ): void {
    const state = this.states.get(executionId);
    const durationMs = Date.now() - startTime;
    const checkpointCount = state?.checkpoints.filter((c) => c.phase === 'review').length ?? 0;
    const metrics = calculateMetrics(outputs, durationMs, checkpointCount);

    const successResult: SelfDevWorkflowResult = {
      executionId,
      success: true,
      phase: 'commit',
      outputs,
      metrics,
    };

    this.results.set(executionId, successResult);
    this.updateStatus(executionId, 'completed');
    this.emit({ type: 'workflow_completed', timestamp: new Date().toISOString() });

    void this.auditTrails.get(executionId)?.workflowCompleted(true, durationMs);

    // Send completion notification
    const prOut = outputs.commit;
    void this.deps.notifications?.workflowCompleted(executionId, prOut?.prNumber, prOut?.prUrl);
  }

  private failWorkflow(executionId: string, error: unknown, startTime: number): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const currentPhase = this.getPhase(executionId) ?? 'analyze';
    const state = this.states.get(executionId);
    const durationMs = Date.now() - startTime;
    const checkpointCount = state?.checkpoints.filter((c) => c.phase === 'review').length ?? 0;
    const metrics = calculateMetrics({}, durationMs, checkpointCount);

    const failureResult: SelfDevWorkflowResult = {
      executionId,
      success: false,
      phase: currentPhase,
      outputs: {},
      metrics,
      error: errorMessage,
    };

    this.results.set(executionId, failureResult);
    this.updateStatus(executionId, 'failed');
    this.emit({
      type: 'workflow_failed',
      phase: currentPhase,
      data: { error: errorMessage },
      timestamp: new Date().toISOString(),
    });

    const audit = this.auditTrails.get(executionId);
    void audit?.phaseFailed(currentPhase, errorMessage);
    void audit?.workflowCompleted(false, durationMs);
    void this.deps.notifications?.workflowFailed(executionId, currentPhase, errorMessage);
  }

  private getPhase(executionId: string): WorkflowPhase | undefined {
    return this.states.get(executionId)?.currentPhase;
  }

  private updatePhase(executionId: string, phase: WorkflowPhase): void {
    const state = this.states.get(executionId);
    if (state === undefined) return;

    const audit = this.auditTrails.get(executionId);
    const prevPhase = state.currentPhase;

    this.emit({ type: 'phase_completed', phase: prevPhase, timestamp: new Date().toISOString() });
    const updated: SelfDevWorkflowState = { ...state, currentPhase: phase };
    this.states.set(executionId, updated);
    this.emit({ type: 'phase_started', phase, timestamp: new Date().toISOString() });

    // Record phase transition in audit trail
    void audit?.phaseCompleted(prevPhase, 0);
    void audit?.phaseStarted(phase);
  }

  private updateStatus(executionId: string, status: SelfDevWorkflowState['status']): void {
    const state = this.states.get(executionId);
    if (state === undefined) return;

    const updated: SelfDevWorkflowState = { ...state, status };
    this.states.set(executionId, updated);
  }

  private createCheckpoint(executionId: string, phase: WorkflowPhase, outputs: unknown): void {
    const state = this.states.get(executionId);
    if (state === undefined) return;

    const checkpoint: WorkflowCheckpoint = {
      phase,
      timestamp: new Date().toISOString(),
      inputs: {},
      outputs,
      status: 'completed',
    };

    const updated: SelfDevWorkflowState = {
      ...state,
      checkpoints: [...state.checkpoints, checkpoint],
    };
    this.states.set(executionId, updated);
    this.emit({ type: 'checkpoint_created', phase, timestamp: checkpoint.timestamp });
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
