/**
 * nexus-agents/agents - Orchestrator Agent
 *
 * The Orchestrator agent is responsible for:
 * - Analyzing incoming tasks for complexity and requirements
 * - Breaking down complex tasks into subtasks
 * - Selecting appropriate expert agents for subtasks
 * - Synthesizing results from multiple experts
 *
 * @remarks
 * Renamed from TechLead in Issue #759. The old class name is retained
 * as a deprecated type alias for backward compatibility.
 *
 * (Source: Nexus Agents CLAUDE.md, Agent Architecture)
 */

import type {
  Result,
  Task,
  TaskResult,
  AgentCapability,
  CompletionRequest,
  Message,
  IAgent,
} from '../core/index.js';
import { getErrorMessage, ok, err, AgentError, getTimeProvider } from '../core/index.js';
import { BaseAgent, type BaseAgentOptions } from './base-agent.js';
import type {
  SubTask,
  TaskAnalysis,
  ExpertAssignment,
  SynthesizedResult,
  OrchestratorOptions,
} from './tech-lead-types.js';
import { TaskAnalysisSchema, SubTaskSchema, SynthesizedResultSchema } from './tech-lead-types.js';
import {
  heuristicAnalysis,
  heuristicSynthesis,
  createSingleResultSynthesis,
  selectExpertForSubtask,
  identifyParallelGroups,
  estimateDuration,
  extractTextContent,
} from './tech-lead-helpers.js';
import { heuristicDecomposition } from './tech-lead-decomposition.js';
import { enrichAssignmentsWithICTM } from './tech-lead-ictm-integration.js';
import type { WorkflowDefinition } from '../core/index.js';
import {
  convertPlanToWorkflow,
  type PlanConversionOptions,
  type ExecutionPlanData,
} from './plan-converter.js';
import {
  OrchestratorCollaborationHelper,
  createOrchestratorCollaborationHelper,
  type OrchestratorCollaborationConfig,
} from './tech-lead-collaboration.js';

/** Default Orchestrator options. */
const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  maxSubtasks: 10,
  decompositionThreshold: 5,
  enableParallelHints: true,
  expertWeights: {},
};

/** Extended options for Orchestrator with collaboration. */
interface OrchestratorExtendedOptions {
  /** Collaboration configuration (Issue #488) */
  collaborationConfig?: OrchestratorCollaborationConfig;
  /** Map of available expert agents for collaboration */
  expertAgents?: Map<string, IAgent>;
}

/** System prompt for task analysis. */
const ANALYSIS_PROMPT = `You are an orchestrator analyzing a software development task.
Analyze the task and provide a structured JSON assessment with: taskId, complexity (1-10),
taskType, requirements[], risks[], needsDecomposition, approach, estimatedEffort.`;

/** System prompt for task decomposition. */
const DECOMPOSITION_PROMPT = `You are an orchestrator breaking down a complex task.
Create subtasks as JSON array with: id, parentTaskId, description, expectedOutput,
dependencies[], priority (critical/high/medium/low), status: "pending", complexity (1-10),
requiredCapabilities[].`;

/** System prompt for result synthesis. */
const SYNTHESIS_PROMPT = `You are an orchestrator synthesizing results from multiple experts.
Respond with JSON: combinedOutput, summary, resultSummaries[], conflicts[], qualityScore (0-1),
recommendations[].`;

/**
 * Execution plan output structure.
 *
 * The ExecutionPlan represents the Orchestrator's analysis and decomposition
 * of a task. It can optionally be converted to a WorkflowDefinition for
 * replayable, static execution via the WorkflowEngine.
 *
 * ExecutionPlan extends ExecutionPlanData (the pure data) with the
 * asWorkflowDefinition conversion method.
 *
 * @see ARCHITECTURE.md for the separation of concerns between Orchestrator and WorkflowEngine
 */
export interface ExecutionPlan extends ExecutionPlanData {
  /**
   * Convert this execution plan to a reusable WorkflowDefinition.
   *
   * This "crystallizes" the dynamic plan into a static, replayable workflow
   * that can be executed by WorkflowEngine.
   *
   * @param options - Optional conversion configuration
   * @returns A valid WorkflowDefinition
   *
   * @example
   * ```typescript
   * const result = await techLead.execute(task);
   * const plan = result.value.output as ExecutionPlan;
   * const workflow = plan.asWorkflowDefinition({
   *   name: 'my-workflow',
   *   version: '1.0.0',
   * });
   * await workflowEngine.execute(workflow, inputs);
   * ```
   */
  asWorkflowDefinition(options?: PlanConversionOptions): WorkflowDefinition;
}

/**
 * Orchestrator Agent - orchestrates task execution by analyzing, decomposing,
 * delegating, and synthesizing results from expert agents.
 *
 * @remarks
 * Renamed from TechLead in Issue #759. The old name is retained as a
 * deprecated type alias for backward compatibility.
 */
export class Orchestrator extends BaseAgent {
  private readonly orchestratorOptions: Required<OrchestratorOptions>;
  private readonly collaborationHelper: OrchestratorCollaborationHelper;
  private expertAgents: Map<string, IAgent>;
  private lastAnalysis?: TaskAnalysis;

  constructor(
    options: Partial<BaseAgentOptions> &
      OrchestratorExtendedOptions & { techLeadOptions?: OrchestratorOptions } = {}
  ) {
    const baseOptions: BaseAgentOptions = {
      id: options.id ?? 'tech-lead',
      role: 'tech_lead',
      capabilities: options.capabilities ?? [
        'task_execution' as AgentCapability,
        'delegation' as AgentCapability,
        'collaboration' as AgentCapability,
        'research' as AgentCapability,
      ],
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 4096,
    };

    // Only add optional properties if defined (for exactOptionalPropertyTypes)
    if (options.adapter !== undefined) baseOptions.adapter = options.adapter;
    if (options.logger !== undefined) baseOptions.logger = options.logger;
    if (options.systemPrompt !== undefined) baseOptions.systemPrompt = options.systemPrompt;

    super(baseOptions);

    this.orchestratorOptions = { ...DEFAULT_OPTIONS, ...options.techLeadOptions };
    this.collaborationHelper = createOrchestratorCollaborationHelper(options.collaborationConfig);
    this.expertAgents = options.expertAgents ?? new Map<string, IAgent>();
  }

  /**
   * Set expert agents for collaboration (Issue #488).
   * Call this to provide agents that can participate in collaborative synthesis.
   */
  setExpertAgents(agents: Map<string, IAgent>): void {
    this.expertAgents = agents;
    this.logger.info('Expert agents registered for collaboration', {
      agentCount: agents.size,
      agentIds: [...agents.keys()],
    });
  }

  /** Execute a task by analyzing, decomposing (if needed), and coordinating. */
  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();

    const analysisResult = await this.analyzeTask(task);
    if (!analysisResult.ok) return err(analysisResult.error);
    const analysis = analysisResult.value;

    // Store analysis for use in synthesis (Issue #488)
    this.lastAnalysis = analysis;

    this.logger.info('Task analyzed', {
      taskId: task.id,
      complexity: analysis.complexity,
      needsDecomposition: analysis.needsDecomposition,
    });

    let subtasks: SubTask[] = [];
    if (analysis.needsDecomposition) {
      const decomposeResult = await this.decomposeTask(task, analysis);
      if (!decomposeResult.ok) return err(decomposeResult.error);
      subtasks = decomposeResult.value;
    }

    const baseAssignments = this.selectExperts(subtasks);

    // Enrich assignments with ICTM configurations (Issue #756)
    const { assignments } = enrichAssignmentsWithICTM(baseAssignments, subtasks, analysis);
    const output = this.buildExecutionPlan(task, analysis, subtasks, assignments);

    return ok({
      taskId: task.id,
      output,
      metadata: {
        durationMs: getTimeProvider().now() - startTime,
        tokensUsed: 0,
        toolsUsed: [],
        model: 'tech-lead-orchestration',
      },
    });
  }

  /** Build prompt messages for task execution. */
  protected buildPrompt(task: Task): Message[] {
    return [{ role: 'user', content: `Analyze and plan execution for:\n\n${task.description}` }];
  }

  /** Analyze a task to understand its complexity and requirements. */
  async analyzeTask(task: Task): Promise<Result<TaskAnalysis, AgentError>> {
    if (this.adapter === undefined) {
      return ok(heuristicAnalysis(task, this.orchestratorOptions));
    }

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: `Task ID: ${task.id}\n\n${task.description}` }],
      systemPrompt: ANALYSIS_PROMPT,
      temperature: 0.2,
      maxTokens: 2048,
    };

    const result = await this.complete(request);
    if (!result.ok) return err(result.error);

    const parseResult = this.parseJson<TaskAnalysis>(
      extractTextContent(result.value.content),
      TaskAnalysisSchema
    );

    if (!parseResult.ok) {
      this.logger.warn('Failed to parse analysis response, using heuristic', {
        error: parseResult.error.message,
      });
      return ok(heuristicAnalysis(task, this.orchestratorOptions));
    }

    return ok(parseResult.value);
  }

  /** Decompose a task into subtasks. */
  async decomposeTask(task: Task, analysis: TaskAnalysis): Promise<Result<SubTask[], AgentError>> {
    if (this.adapter === undefined) {
      return ok(heuristicDecomposition(task, analysis, this.orchestratorOptions.maxSubtasks));
    }

    const request: CompletionRequest = {
      messages: [
        {
          role: 'user',
          content: `Task: ${task.description}\nAnalysis: ${JSON.stringify(analysis)}\nMax: ${String(this.orchestratorOptions.maxSubtasks)}`,
        },
      ],
      systemPrompt: DECOMPOSITION_PROMPT,
      temperature: 0.3,
      maxTokens: 4096,
    };

    const result = await this.complete(request);
    if (!result.ok) return err(result.error);

    try {
      const parsed = JSON.parse(extractTextContent(result.value.content)) as unknown[];
      const subtasks = parsed
        .map((item) => SubTaskSchema.safeParse(item))
        .filter((r) => r.success)
        .map((r) => r.data as SubTask);

      return ok(
        subtasks.length > 0
          ? subtasks.slice(0, this.orchestratorOptions.maxSubtasks)
          : heuristicDecomposition(task, analysis, this.orchestratorOptions.maxSubtasks)
      );
    } catch {
      this.logger.warn('Failed to parse decomposition response, using heuristic');
      return ok(heuristicDecomposition(task, analysis, this.orchestratorOptions.maxSubtasks));
    }
  }

  /** Select appropriate expert agents for each subtask. */
  selectExperts(subtasks: SubTask[]): ExpertAssignment[] {
    return subtasks.map((st) => selectExpertForSubtask(st, this.orchestratorOptions.expertWeights));
  }

  /**
   * Synthesize results from multiple experts into a cohesive output.
   *
   * Uses collaboration protocols for complex multi-expert synthesis (Issue #488)
   * when enough experts and task complexity warrant it.
   *
   * @param results - Results to synthesize
   * @param originalTask - Optional original task for context in collaborative synthesis
   */
  async synthesizeResults(
    results: TaskResult[],
    originalTask?: Task
  ): Promise<Result<SynthesizedResult, AgentError>> {
    // Handle edge cases
    const edgeResult = this.handleSynthesisEdgeCases(results);
    if (edgeResult !== undefined) return edgeResult;

    // Try collaborative synthesis for complex tasks (Issue #488)
    const collabResult = await this.tryCollaborativeSynthesis(results, originalTask);
    if (collabResult !== undefined) return collabResult;

    // Fall back to LLM or heuristic synthesis
    return this.performStandardSynthesis(results);
  }

  /** Handle empty and single result edge cases. */
  private handleSynthesisEdgeCases(
    results: TaskResult[]
  ): Result<SynthesizedResult, AgentError> | undefined {
    if (results.length === 0) {
      return ok({
        combinedOutput: '',
        summary: 'No results to synthesize',
        resultSummaries: [],
        conflicts: [],
        qualityScore: 0,
        recommendations: ['Ensure subtasks complete before synthesis'],
      });
    }
    if (results.length === 1) {
      const r = results[0];
      if (r === undefined) return err(new AgentError('Invalid result in array'));
      return ok(createSingleResultSynthesis(r));
    }
    return undefined;
  }

  /** Try collaborative synthesis if conditions are met. */
  private async tryCollaborativeSynthesis(
    results: TaskResult[],
    originalTask?: Task
  ): Promise<Result<SynthesizedResult, AgentError> | undefined> {
    const analysis = this.lastAnalysis ?? ({ complexity: 5 } as TaskAnalysis);
    const shouldCollaborate =
      this.collaborationHelper.shouldUseCollaboration(analysis, results.length) &&
      this.expertAgents.size > 0 &&
      originalTask !== undefined;

    if (!shouldCollaborate) return undefined;

    this.logger.info('Using collaborative synthesis', {
      resultCount: results.length,
      complexity: analysis.complexity,
      expertCount: this.expertAgents.size,
    });

    const collabResult = await this.collaborationHelper.collaborativeSynthesis(
      results,
      this.expertAgents,
      originalTask
    );

    if (collabResult.ok) return collabResult;

    this.logger.warn('Collaborative synthesis failed, falling back to standard', {
      error: collabResult.error.message,
    });
    return undefined;
  }

  /** Perform standard LLM or heuristic synthesis. */
  private async performStandardSynthesis(
    results: TaskResult[]
  ): Promise<Result<SynthesizedResult, AgentError>> {
    if (this.adapter === undefined) return ok(heuristicSynthesis(results));

    const request: CompletionRequest = {
      messages: [{ role: 'user', content: `Synthesize:\n${JSON.stringify(results, null, 2)}` }],
      systemPrompt: SYNTHESIS_PROMPT,
      temperature: 0.2,
      maxTokens: 4096,
    };

    const result = await this.complete(request);
    if (!result.ok) return err(result.error);

    const parseResult = this.parseJson<SynthesizedResult>(
      extractTextContent(result.value.content),
      SynthesizedResultSchema
    );

    return parseResult.ok ? ok(parseResult.value) : ok(heuristicSynthesis(results));
  }

  /**
   * Get the collaboration helper for external use.
   */
  getCollaborationHelper(): OrchestratorCollaborationHelper {
    return this.collaborationHelper;
  }

  /** Get the Orchestrator options. */
  getOptions(): Readonly<Required<OrchestratorOptions>> {
    return { ...this.orchestratorOptions };
  }

  private buildExecutionPlan(
    task: Task,
    analysis: TaskAnalysis,
    subtasks: SubTask[],
    assignments: ExpertAssignment[]
  ): ExecutionPlan {
    const parallelGroups = this.orchestratorOptions.enableParallelHints
      ? identifyParallelGroups(subtasks)
      : [];
    const estimatedDuration = estimateDuration(subtasks);

    // Create the base plan data
    const planData = {
      taskId: task.id,
      analysis,
      subtasks,
      assignments,
      parallelGroups,
      estimatedDuration,
    };

    // Return plan with conversion method attached
    return {
      ...planData,
      asWorkflowDefinition(options?: PlanConversionOptions): WorkflowDefinition {
        return convertPlanToWorkflow(planData, options);
      },
    };
  }

  private parseJson<T>(
    text: string,
    schema: {
      safeParse: (d: unknown) => { success: boolean; data?: T; error?: { message: string } };
    }
  ): Result<T, AgentError> {
    try {
      let jsonText = text;
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match?.[1] !== undefined) jsonText = match[1];

      const parsed = JSON.parse(jsonText) as unknown;
      const validation = schema.safeParse(parsed);

      if (!validation.success) {
        return err(new AgentError(`Invalid schema: ${validation.error?.message ?? 'Unknown'}`));
      }
      return ok(validation.data as T);
    } catch (error) {
      return err(new AgentError(`JSON parse failed: ${getErrorMessage(error)}`));
    }
  }
}

/**
 * @deprecated Use {@link createOrchestrator} instead. Will be removed in v3.0.
 *
 * @example
 * ```typescript
 * const orchestrator = createOrchestrator({
 *   orchestratorOptions: { maxSubtasks: 5 },
 * });
 * const result = await orchestrator.execute(task);
 * ```
 */
export function createTechLead(
  options?: Partial<BaseAgentOptions> & { techLeadOptions?: OrchestratorOptions }
): Orchestrator {
  return new Orchestrator(options);
}

/**
 * Creates a new Orchestrator agent with the given options.
 * This is the preferred factory function for creating coordination agents.
 *
 * @param options - Agent configuration options
 * @returns Orchestrator agent instance
 *
 * @example
 * ```typescript
 * const orchestrator = createOrchestrator({
 *   orchestratorOptions: { maxSubtasks: 5 }
 * });
 * const result = await orchestrator.execute(task);
 * ```
 */
export function createOrchestrator(
  options?: Partial<BaseAgentOptions> & { orchestratorOptions?: OrchestratorOptions }
): Orchestrator {
  const { orchestratorOptions, ...restOptions } = options ?? {};
  return new Orchestrator({
    ...restOptions,
    ...(orchestratorOptions !== undefined && { techLeadOptions: orchestratorOptions }),
  });
}
