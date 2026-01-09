/**
 * nexus-agents/agents - SICA Self-Improving Agent
 *
 * A unified agent that performs tasks AND improves its own implementation
 * through tool orchestration, without weight updates.
 *
 * @module agents/self-improving/sica-agent
 * (Source: arXiv:2504.15228, Issue #151)
 */

import { randomUUID } from 'node:crypto';
import type { Result, ILogger, IAgent, Task, TaskResult } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  AgentConfiguration,
  AgentVersion,
  ExecutionMetrics,
  VersionMetrics,
  SicaExecutionResult,
  ImprovementAttempt,
  ImprovementOptions,
  ConfigurationChange,
  SicaConfig,
} from './sica-types.js';
import { DEFAULT_SICA_CONFIG } from './sica-types.js';
import { SicaVersionManager } from './sica-version-manager.js';

/**
 * Options for creating a SICA agent.
 */
export interface SicaAgentOptions {
  /** Initial configuration */
  readonly initialConfig: AgentConfiguration;
  /** The underlying agent to wrap */
  readonly baseAgent: IAgent;
  /** SICA configuration */
  readonly sicaConfig?: Partial<SicaConfig>;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Self-Improving Coding Agent.
 *
 * Wraps a base agent and adds self-improvement capabilities:
 * - Version management with performance tracking
 * - Automatic improvement suggestions based on performance
 * - Best version selection
 */
export class SicaAgent {
  private readonly config: SicaConfig;
  private readonly logger: ILogger;
  private readonly versionManager: SicaVersionManager;
  private readonly baseAgent: IAgent;
  private readonly improvementHistory: ImprovementAttempt[];
  private lastImprovementTime: number;

  constructor(options: SicaAgentOptions) {
    this.config = { ...DEFAULT_SICA_CONFIG, ...options.sicaConfig };
    this.logger = options.logger ?? createLogger({ component: 'SicaAgent' });
    this.versionManager = new SicaVersionManager(this.config, this.logger);
    this.baseAgent = options.baseAgent;
    this.improvementHistory = [];
    this.lastImprovementTime = 0;

    this.versionManager.createInitialVersion(options.initialConfig);

    this.logger.info('SICA agent initialized', {
      baseAgentId: options.baseAgent.id,
      improvementThreshold: this.config.improvementThreshold,
    });
  }

  /**
   * Executes a task using the current best version.
   */
  async execute(task: Task): Promise<Result<SicaExecutionResult, AgentError>> {
    const version = this.versionManager.getActiveVersion();
    if (version === null) {
      return err(new AgentError('No active version available'));
    }

    const startTime = Date.now();
    this.logger.debug('Executing task', { taskId: task.id, versionId: version.id });

    const result = await this.executeWithVersion(task, version);
    const metrics = this.buildMetrics(result, startTime);

    this.versionManager.recordExecution(version.id, metrics);

    const shouldImprove = this.checkImprovementTrigger(version.id);

    if (this.config.autoSelectBest) {
      this.versionManager.selectBestVersion();
    }

    if (!result.ok) {
      return err(result.error);
    }

    return ok({
      output: result.value.output as string,
      versionId: version.id,
      metrics,
      triggeredImprovement: shouldImprove,
    });
  }

  /**
   * Manually triggers an improvement attempt.
   */
  triggerImprovement(
    options: ImprovementOptions = {}
  ): Promise<Result<ImprovementAttempt, AgentError>> {
    const currentVersion = this.versionManager.getActiveVersion();
    if (currentVersion === null) {
      return Promise.resolve(err(new AgentError('No active version to improve')));
    }

    const metrics = this.versionManager.getMetrics(currentVersion.id);
    if (metrics === null) {
      return Promise.resolve(err(new AgentError('No metrics available for improvement')));
    }

    if (options.force !== true && !this.canTriggerImprovement()) {
      return Promise.resolve(err(new AgentError('Improvement cooldown not elapsed')));
    }

    this.lastImprovementTime = Date.now();

    const attempt = this.generateImprovement(currentVersion, metrics, options);
    this.improvementHistory.push(attempt);

    this.logger.info('Improvement attempt completed', {
      sourceVersionId: currentVersion.id,
      successful: attempt.successful,
      resultVersionId: attempt.resultVersionId,
    });

    return Promise.resolve(ok(attempt));
  }

  /**
   * Gets the current active version.
   */
  getActiveVersion(): AgentVersion | null {
    return this.versionManager.getActiveVersion();
  }

  /**
   * Gets all versions.
   */
  getAllVersions(): readonly AgentVersion[] {
    return this.versionManager.getActiveVersions();
  }

  /**
   * Gets improvement history.
   */
  getImprovementHistory(): readonly ImprovementAttempt[] {
    return this.improvementHistory;
  }

  /**
   * Gets the version manager for advanced operations.
   */
  getVersionManager(): SicaVersionManager {
    return this.versionManager;
  }

  /** Executes a task with a specific version. */
  private async executeWithVersion(
    task: Task,
    version: AgentVersion
  ): Promise<Result<TaskResult, AgentError>> {
    const enhancedTask = this.enhanceTaskWithConfig(task, version.configuration);
    return this.baseAgent.execute(enhancedTask);
  }

  /** Enhances a task with version configuration. */
  private enhanceTaskWithConfig(task: Task, config: AgentConfiguration): Task {
    return {
      ...task,
      context: {
        ...task.context,
        metadata: {
          ...(task.context.metadata ?? {}),
          sicaConfig: {
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            parameters: config.parameters,
          },
        },
      },
    };
  }

  /** Builds execution metrics from a result. */
  private buildMetrics(
    result: Result<TaskResult, AgentError>,
    startTime: number
  ): ExecutionMetrics {
    const durationMs = Date.now() - startTime;

    if (!result.ok) {
      return {
        durationMs,
        tokensUsed: 0,
        success: false,
        errorType: result.error.message,
      };
    }

    return {
      durationMs,
      tokensUsed: result.value.metadata.tokensUsed,
      success: true,
      qualityScore: this.estimateQuality(result.value),
    };
  }

  /** Estimates quality of output (simplified). */
  private estimateQuality(result: TaskResult): number {
    const output = result.output as string;
    if (typeof output !== 'string') return 0.5;

    let score = 0.5;
    if (output.length > 100) score += 0.1;
    if (output.length > 500) score += 0.1;
    if (!output.includes('error') && !output.includes('Error')) score += 0.1;
    if (output.includes('```')) score += 0.1;

    return Math.min(1, score);
  }

  /** Checks if improvement should be triggered. */
  private checkImprovementTrigger(versionId: string): boolean {
    if (!this.canTriggerImprovement()) return false;
    if (!this.versionManager.shouldTriggerImprovement(versionId)) return false;

    this.logger.info('Improvement triggered', { versionId });
    this.triggerImprovement().catch((error: unknown) => {
      this.logger.warn('Background improvement failed', { error });
    });

    return true;
  }

  /** Checks if improvement can be triggered (cooldown). */
  private canTriggerImprovement(): boolean {
    const elapsed = Date.now() - this.lastImprovementTime;
    return elapsed >= this.config.improvementCooldownMs;
  }

  /** Generates an improvement for the current version. */
  private generateImprovement(
    currentVersion: AgentVersion,
    metrics: VersionMetrics,
    options: ImprovementOptions
  ): ImprovementAttempt {
    const hypothesis = this.generateHypothesis(metrics, options);
    const changes = this.generateChanges(currentVersion.configuration, hypothesis, options);

    if (changes.length === 0) {
      return this.createFailedAttempt(currentVersion.id, hypothesis, 'No changes generated');
    }

    const newConfig = this.applyChanges(currentVersion.configuration, changes);
    const newVersion = this.versionManager.createDerivedVersion(
      currentVersion.id,
      newConfig,
      hypothesis
    );

    if (newVersion === null) {
      return this.createFailedAttempt(currentVersion.id, hypothesis, 'Failed to create version');
    }

    return {
      id: randomUUID(),
      sourceVersionId: currentVersion.id,
      resultVersionId: newVersion.id,
      hypothesis,
      changes,
      successful: true,
      attemptedAt: new Date(),
      validation: {
        passed: true,
        performanceChange: 0,
        checks: [{ name: 'version_created', passed: true }],
      },
    };
  }

  /** Generates an improvement hypothesis. */
  private generateHypothesis(metrics: VersionMetrics, options: ImprovementOptions): string {
    const focus = options.focusArea ?? 'reliability';

    if (metrics.successRate < 0.5) {
      return 'Improve error handling and robustness';
    }
    if (focus === 'speed' && metrics.avgDurationMs > 10000) {
      return 'Optimize for faster execution';
    }
    if (focus === 'quality' && (metrics.avgQualityScore ?? 0.5) < 0.7) {
      return 'Enhance output quality and completeness';
    }
    if (focus === 'cost' && metrics.avgTokensUsed > 2000) {
      return 'Reduce token usage while maintaining quality';
    }

    return 'General improvement to prompt clarity and structure';
  }

  /** Generates configuration changes based on hypothesis. */
  private generateChanges(
    config: AgentConfiguration,
    hypothesis: string,
    _options: ImprovementOptions
  ): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];

    if (hypothesis.includes('error handling')) {
      changes.push({
        field: 'systemPrompt',
        oldValue: config.systemPrompt,
        newValue: this.improvePromptForErrors(config.systemPrompt),
        reason: 'Added explicit error handling instructions',
      });
    }

    if (hypothesis.includes('faster')) {
      changes.push({
        field: 'maxTokens',
        oldValue: config.maxTokens,
        newValue: Math.max(500, Math.floor(config.maxTokens * 0.8)),
        reason: 'Reduced max tokens for faster response',
      });
    }

    if (hypothesis.includes('quality')) {
      changes.push({
        field: 'temperature',
        oldValue: config.temperature,
        newValue: Math.max(0.1, config.temperature - 0.1),
        reason: 'Lowered temperature for more consistent output',
      });
    }

    if (hypothesis.includes('token usage')) {
      changes.push({
        field: 'systemPrompt',
        oldValue: config.systemPrompt,
        newValue: this.improvePromptForConciseness(config.systemPrompt),
        reason: 'Added conciseness instructions',
      });
    }

    // General improvement if no specific changes
    if (changes.length === 0 && hypothesis.includes('General')) {
      changes.push({
        field: 'systemPrompt',
        oldValue: config.systemPrompt,
        newValue: this.improvePromptGeneral(config.systemPrompt),
        reason: 'Refined prompt clarity and structure',
      });
    }

    return changes;
  }

  /** Improves prompt generally. */
  private improvePromptGeneral(prompt: string): string {
    const addition = '\n\nFocus on clarity, correctness, and completeness in your responses.';
    return prompt + addition;
  }

  /** Improves prompt for error handling. */
  private improvePromptForErrors(prompt: string): string {
    const addition =
      '\n\nIMPORTANT: Handle edge cases carefully. Validate inputs before processing.';
    return prompt + addition;
  }

  /** Improves prompt for conciseness. */
  private improvePromptForConciseness(prompt: string): string {
    const addition = '\n\nBe concise. Provide direct answers without unnecessary elaboration.';
    return prompt + addition;
  }

  /** Applies changes to create a new configuration. */
  private applyChanges(
    config: AgentConfiguration,
    changes: ConfigurationChange[]
  ): AgentConfiguration {
    let result = { ...config };

    for (const change of changes) {
      if (change.field === 'systemPrompt') {
        result = { ...result, systemPrompt: change.newValue as string };
      } else if (change.field === 'temperature') {
        result = { ...result, temperature: change.newValue as number };
      } else if (change.field === 'maxTokens') {
        result = { ...result, maxTokens: change.newValue as number };
      }
    }

    return result;
  }

  /** Creates a failed improvement attempt. */
  private createFailedAttempt(
    sourceVersionId: string,
    hypothesis: string,
    reason: string
  ): ImprovementAttempt {
    return {
      id: randomUUID(),
      sourceVersionId,
      hypothesis,
      changes: [],
      successful: false,
      attemptedAt: new Date(),
      validation: {
        passed: false,
        performanceChange: 0,
        checks: [{ name: 'creation', passed: false, details: reason }],
      },
    };
  }
}

/**
 * Creates a SICA agent.
 */
export function createSicaAgent(options: SicaAgentOptions): SicaAgent {
  return new SicaAgent(options);
}
