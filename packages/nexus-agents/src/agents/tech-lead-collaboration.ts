/**
 * TechLead Collaboration Integration
 *
 * Wires collaboration protocols (consensus, aegean, reflexion) into TechLead
 * for enhanced synthesis and complex task coordination.
 *
 * @module agents/tech-lead-collaboration
 * (Source: Issue #488 - Wire collaboration protocols to TechLead)
 */

import type { Result, Task, TaskResult, IAgent, ILogger } from '../core/index.js';
import { ok, err, AgentError, createLogger } from '../core/index.js';
import type {
  CollaborationConfig,
  CollaborationResult,
  ExpertResultSummary,
} from './collaboration/collaboration-types.js';
import {
  AdaptiveProtocolSelector,
  createAdaptiveProtocolSelector,
} from './collaboration/adaptive-protocol-selector.js';
import type {
  TaskAnalysis,
  SynthesizedResult,
  ResultSummary,
  Conflict,
} from './tech-lead-types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for TechLead collaboration integration.
 */
export interface TechLeadCollaborationConfig {
  /** Enable collaboration protocols for synthesis */
  readonly enableCollaborativeSynthesis?: boolean;
  /** Minimum number of experts to trigger collaborative synthesis */
  readonly minExpertsForCollaboration?: number;
  /** Complexity threshold for using collaboration protocols */
  readonly complexityThreshold?: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Default configuration.
 */
const DEFAULT_COLLAB_CONFIG: Required<TechLeadCollaborationConfig> = {
  enableCollaborativeSynthesis: true,
  minExpertsForCollaboration: 3,
  complexityThreshold: 7,
  logger: createLogger({ component: 'TechLeadCollab' }),
};

/**
 * TechLead collaboration helper.
 *
 * Provides methods to use collaboration protocols for:
 * - Synthesizing results from multiple experts
 * - Coordinating complex multi-expert tasks
 */
export class TechLeadCollaborationHelper {
  private readonly config: Required<TechLeadCollaborationConfig>;
  private readonly protocolSelector: AdaptiveProtocolSelector;
  private readonly logger: ILogger;

  constructor(config?: TechLeadCollaborationConfig) {
    this.config = { ...DEFAULT_COLLAB_CONFIG, ...config };
    this.logger = this.config.logger;
    this.protocolSelector = createAdaptiveProtocolSelector({
      logger: this.logger,
      logDecisions: true,
    });
  }

  /**
   * Check if task should use collaborative synthesis.
   */
  shouldUseCollaboration(analysis: TaskAnalysis, resultCount: number): boolean {
    if (!this.config.enableCollaborativeSynthesis) return false;
    if (resultCount < this.config.minExpertsForCollaboration) return false;
    if (analysis.complexity < this.config.complexityThreshold) return false;
    return true;
  }

  /**
   * Synthesize results using collaboration protocols.
   *
   * @param results - Results from multiple experts
   * @param agents - Map of available agents for collaboration
   * @param originalTask - The original task being synthesized
   */
  async collaborativeSynthesis(
    results: TaskResult[],
    agents: Map<string, IAgent>,
    originalTask: Task
  ): Promise<Result<SynthesizedResult, AgentError>> {
    if (results.length < this.config.minExpertsForCollaboration) {
      return err(
        new AgentError(
          `Need at least ${String(this.config.minExpertsForCollaboration)} results for collaborative synthesis`
        )
      );
    }

    const { collabConfig, sessionId } = this.buildCollabConfig(results, originalTask);

    this.logger.info('Starting collaborative synthesis', {
      sessionId,
      resultCount: results.length,
      experts: collabConfig.experts,
    });

    return this.executeCollaboration(collabConfig, agents, results);
  }

  /** Build collaboration configuration for synthesis. */
  private buildCollabConfig(
    results: TaskResult[],
    originalTask: Task
  ): { collabConfig: CollaborationConfig; sessionId: string } {
    const sessionId = `synthesis-${uuidv4().slice(0, 8)}`;
    const synthesisTask: Task = {
      id: sessionId,
      description: createSynthesisPrompt(results, originalTask),
      context: { metadata: { type: 'synthesis' } },
    };
    const expertIds = getExpertIdsFromResults(results);

    return {
      sessionId,
      collabConfig: {
        sessionId,
        pattern: 'consensus',
        experts: expertIds,
        task: synthesisTask,
        timeout: 60000,
        minVotes: Math.ceil(expertIds.length * 0.7),
      },
    };
  }

  /** Execute collaboration protocol. */
  private async executeCollaboration(
    config: CollaborationConfig,
    agents: Map<string, IAgent>,
    results: TaskResult[]
  ): Promise<Result<SynthesizedResult, AgentError>> {
    const recommendation = this.protocolSelector.getRecommendation(config);
    this.logger.info('Protocol recommendation', {
      pattern: recommendation.recommendedPattern,
      taskType: recommendation.taskType,
      confidence: recommendation.confidence,
    });

    const collaborationResult = await this.protocolSelector.execute(
      { ...config, pattern: recommendation.recommendedPattern },
      agents
    );

    if (!collaborationResult.ok) {
      return err(new AgentError(`Collaboration failed: ${collaborationResult.error.message}`));
    }
    return ok(mapCollaborationToSynthesis(collaborationResult.value, results));
  }

  /**
   * Get the protocol selector for custom usage.
   */
  getProtocolSelector(): AdaptiveProtocolSelector {
    return this.protocolSelector;
  }
}

/**
 * Extract expert IDs from results.
 */
function getExpertIdsFromResults(results: TaskResult[]): string[] {
  return results.map((r) => r.metadata.model);
}

/**
 * Create a synthesis prompt from results.
 */
function createSynthesisPrompt(results: TaskResult[], originalTask: Task): string {
  const resultSummaries = results.map((r, i) => {
    const output =
      typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2).slice(0, 500);
    return `Expert ${String(i + 1)} (${r.metadata.model}):\n${output}`;
  });

  return `Synthesize the following expert results into a coherent response.

Original Task: ${originalTask.description}

Expert Results:
${resultSummaries.join('\n\n---\n\n')}

Please:
1. Identify areas of agreement between experts
2. Highlight any conflicts or contradictions
3. Provide a combined, coherent output
4. Assess overall quality and provide recommendations`;
}

/**
 * Format a result for display in synthesis.
 */
function formatResult(result: TaskResult): string {
  if (typeof result.output === 'string') return result.output;
  return JSON.stringify(result.output, null, 2);
}

/**
 * Map collaboration result to synthesis result.
 */
function mapCollaborationToSynthesis(
  collab: CollaborationResult,
  originalResults: TaskResult[]
): SynthesizedResult {
  const combinedOutput =
    typeof collab.aggregatedResult.output === 'string'
      ? collab.aggregatedResult.output
      : JSON.stringify(collab.aggregatedResult.output, null, 2);

  // Extract conflicts from expert disagreements
  const conflicts: Conflict[] = extractConflicts(collab.expertResults);

  // Build result summaries from expert results
  const resultSummaries: ResultSummary[] = originalResults.map((r, i) => ({
    subtaskId: r.taskId,
    summary: formatResult(r).slice(0, 200),
    quality: collab.expertResults[i]?.contributionScore ?? 0.5,
    contributions: [formatResult(r).slice(0, 100)],
  }));

  return {
    combinedOutput,
    summary: `Collaborative synthesis via ${collab.sessionId} (${collab.pattern})`,
    resultSummaries,
    conflicts,
    qualityScore: calculateQualityScore(collab),
    recommendations: generateRecommendations(collab),
    collaborationMetadata: {
      sessionId: collab.sessionId,
      pattern: collab.pattern,
      participantCount: collab.expertResults.length,
      agreementLevel: calculateAgreementLevel(collab),
    },
  };
}

/**
 * Extract conflicts from expert results.
 */
function extractConflicts(expertResults: ExpertResultSummary[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const failed = expertResults.filter((e) => !e.success);

  if (failed.length > 0) {
    conflicts.push({
      subtaskId1: failed[0]?.expertId ?? 'unknown',
      subtaskId2: 'synthesis',
      description: `${String(failed.length)} experts failed to contribute`,
      resolution: 'Excluded from final synthesis',
    });
  }

  return conflicts;
}

/**
 * Calculate quality score from collaboration result.
 */
function calculateQualityScore(collab: CollaborationResult): number {
  if (!collab.success) return 0.3;

  const successCount = collab.expertResults.filter((e) => e.success).length;
  const totalCount = collab.expertResults.length;
  if (totalCount === 0) return 0;

  // Base score from completion rate
  const completionRate = successCount / totalCount;

  // Average contribution scores
  const avgContribution =
    collab.expertResults.reduce((sum, e) => sum + e.contributionScore, 0) / totalCount;

  return Math.min(1, completionRate * 0.6 + avgContribution * 0.4);
}

/**
 * Calculate agreement level from collaboration.
 */
function calculateAgreementLevel(collab: CollaborationResult): number {
  const successful = collab.expertResults.filter((e) => e.success);
  if (successful.length === 0) return 0;
  return successful.length / collab.expertResults.length;
}

/**
 * Generate recommendations from collaboration result.
 */
function generateRecommendations(collab: CollaborationResult): string[] {
  const recommendations: string[] = [];
  const failedCount = collab.expertResults.filter((e) => !e.success).length;

  if (failedCount > 0) {
    recommendations.push(`${String(failedCount)} experts failed - consider reviewing their inputs`);
  }

  const agreementLevel = calculateAgreementLevel(collab);
  if (agreementLevel < 0.7) {
    recommendations.push('Low agreement level - consider additional expert review');
  }

  if (agreementLevel >= 0.9) {
    recommendations.push('High confidence in synthesis due to strong expert agreement');
  }

  if (collab.durationMs > 30000) {
    recommendations.push('Collaboration took longer than expected - consider simplifying task');
  }

  return recommendations;
}

/**
 * Create a TechLead collaboration helper.
 */
export function createTechLeadCollaborationHelper(
  config?: TechLeadCollaborationConfig
): TechLeadCollaborationHelper {
  return new TechLeadCollaborationHelper(config);
}
