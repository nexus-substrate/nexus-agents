/**
 * nexus-agents/agents - TechLead Agent
 *
 * The TechLead agent is responsible for:
 * - Analyzing incoming tasks for complexity and requirements
 * - Breaking down complex tasks into subtasks
 * - Selecting appropriate expert agents for subtasks
 * - Synthesizing results from multiple experts
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
} from '../core/index.js';
import { ok, err, AgentError } from '../core/index.js';
import { BaseAgent, type BaseAgentOptions } from './base-agent.js';
import type {
  SubTask,
  TaskAnalysis,
  ExpertAssignment,
  SynthesizedResult,
  TechLeadOptions,
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
import type { WorkflowDefinition } from '../core/index.js';
import {
  convertPlanToWorkflow,
  type PlanConversionOptions,
  type ExecutionPlanData,
} from './plan-converter.js';

/** Default TechLead options. */
const DEFAULT_OPTIONS: Required<TechLeadOptions> = {
  maxSubtasks: 10,
  decompositionThreshold: 5,
  enableParallelHints: true,
  expertWeights: {},
};

/** System prompt for task analysis. */
const ANALYSIS_PROMPT = `You are a technical lead analyzing a software development task.
Analyze the task and provide a structured JSON assessment with: taskId, complexity (1-10),
taskType, requirements[], risks[], needsDecomposition, approach, estimatedEffort.`;

/** System prompt for task decomposition. */
const DECOMPOSITION_PROMPT = `You are a technical lead breaking down a complex task.
Create subtasks as JSON array with: id, parentTaskId, description, expectedOutput,
dependencies[], priority (critical/high/medium/low), status: "pending", complexity (1-10),
requiredCapabilities[].`;

/** System prompt for result synthesis. */
const SYNTHESIS_PROMPT = `You are a technical lead synthesizing results from multiple experts.
Respond with JSON: combinedOutput, summary, resultSummaries[], conflicts[], qualityScore (0-1),
recommendations[].`;

/**
 * Execution plan output structure.
 *
 * The ExecutionPlan represents the TechLead's analysis and decomposition
 * of a task. It can optionally be converted to a WorkflowDefinition for
 * replayable, static execution via the WorkflowEngine.
 *
 * ExecutionPlan extends ExecutionPlanData (the pure data) with the
 * asWorkflowDefinition conversion method.
 *
 * @see ARCHITECTURE.md for the separation of concerns between TechLead and WorkflowEngine
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
 * TechLead Agent - orchestrates task execution by analyzing, decomposing,
 * delegating, and synthesizing results from expert agents.
 */
export class TechLead extends BaseAgent {
  private readonly techLeadOptions: Required<TechLeadOptions>;

  constructor(options: Partial<BaseAgentOptions> & { techLeadOptions?: TechLeadOptions } = {}) {
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

    this.techLeadOptions = { ...DEFAULT_OPTIONS, ...options.techLeadOptions };
  }

  /** Execute a task by analyzing, decomposing (if needed), and coordinating. */
  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = Date.now();

    const analysisResult = await this.analyzeTask(task);
    if (!analysisResult.ok) return err(analysisResult.error);
    const analysis = analysisResult.value;

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

    const assignments = this.selectExperts(subtasks);
    const output = this.buildExecutionPlan(task, analysis, subtasks, assignments);

    return ok({
      taskId: task.id,
      output,
      metadata: {
        durationMs: Date.now() - startTime,
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
      return ok(heuristicAnalysis(task, this.techLeadOptions));
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
      return ok(heuristicAnalysis(task, this.techLeadOptions));
    }

    return ok(parseResult.value);
  }

  /** Decompose a task into subtasks. */
  async decomposeTask(task: Task, analysis: TaskAnalysis): Promise<Result<SubTask[], AgentError>> {
    if (this.adapter === undefined) {
      return ok(heuristicDecomposition(task, analysis, this.techLeadOptions.maxSubtasks));
    }

    const request: CompletionRequest = {
      messages: [
        {
          role: 'user',
          content: `Task: ${task.description}\nAnalysis: ${JSON.stringify(analysis)}\nMax: ${String(this.techLeadOptions.maxSubtasks)}`,
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
          ? subtasks.slice(0, this.techLeadOptions.maxSubtasks)
          : heuristicDecomposition(task, analysis, this.techLeadOptions.maxSubtasks)
      );
    } catch {
      this.logger.warn('Failed to parse decomposition response, using heuristic');
      return ok(heuristicDecomposition(task, analysis, this.techLeadOptions.maxSubtasks));
    }
  }

  /** Select appropriate expert agents for each subtask. */
  selectExperts(subtasks: SubTask[]): ExpertAssignment[] {
    return subtasks.map((st) => selectExpertForSubtask(st, this.techLeadOptions.expertWeights));
  }

  /** Synthesize results from multiple experts into a cohesive output. */
  async synthesizeResults(results: TaskResult[]): Promise<Result<SynthesizedResult, AgentError>> {
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

  /** Get the TechLead options. */
  getOptions(): Readonly<Required<TechLeadOptions>> {
    return { ...this.techLeadOptions };
  }

  private buildExecutionPlan(
    task: Task,
    analysis: TaskAnalysis,
    subtasks: SubTask[],
    assignments: ExpertAssignment[]
  ): ExecutionPlan {
    const parallelGroups = this.techLeadOptions.enableParallelHints
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
      return err(
        new AgentError(
          `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }
}

/** Creates a new TechLead agent with the given options. */
export function createTechLead(
  options?: Partial<BaseAgentOptions> & { techLeadOptions?: TechLeadOptions }
): TechLead {
  return new TechLead(options);
}
