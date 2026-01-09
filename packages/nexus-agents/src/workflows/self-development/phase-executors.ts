/**
 * Phase Executors
 *
 * Individual phase execution logic for the self-development workflow.
 * Wires up existing protocols: TRINITY, Reflexion, Consensus, Self-Debug, Self-Refine.
 *
 * @module workflows/self-development/phase-executors
 */

import type { IAgent, Task, AgentMessage, AgentContext } from '../../core/index.js';
import { createLogger, ok, AgentCapability } from '../../core/index.js';
import type { SelfDevWorkflowDependencies } from './interfaces.js';
import type {
  SelfDevWorkflowState,
  AnalyzeOutput,
  ResearchOutput,
  PlanOutput,
  RefineOutput,
  VoteOutput,
  ImplementOutput,
  VerifyOutput,
  CommitOutput,
  SelfDevWorkflowResult,
  ImplementationPlan,
} from './types.js';
import { SELF_DEV_PERSONAS } from './types.js';
import { runAllVerificationChecks } from './shell-executor.js';

const logger = createLogger({ component: 'self-dev-phase-executors' });

// =============================================================================
// Phase 1: ANALYZE
// =============================================================================

/**
 * Execute ANALYZE phase - Issue analysis and prioritization.
 */
export async function executeAnalyze(
  deps: SelfDevWorkflowDependencies,
  _state: SelfDevWorkflowState
): Promise<AnalyzeOutput> {
  const startTime = Date.now();
  // Placeholder: will await GitHub API calls
  await Promise.resolve();

  // Use GitHub client if available
  if (deps.githubClient !== undefined) {
    logger.info('ANALYZE phase: GitHub client available');
    // TODO: Implement full issue analysis
    // const issues = await deps.githubClient.listIssues(['self-development-approved']);
    // ... prioritize and select
  } else {
    logger.info('ANALYZE phase: using placeholder (no GitHub client)');
  }

  return {
    prioritizedIssues: [],
    selectedIssue: {
      number: 0,
      title: 'Placeholder',
      body: '',
      labels: [],
      priorityScore: 0,
      complexity: 1,
      estimatedEffort: '1h',
      dependencies: [],
      risks: [],
      keywords: [],
      topics: [],
      type: 'enhancement',
    },
    selectionRationale: 'Placeholder - implement with GitHub API',
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Phase 2: RESEARCH
// =============================================================================

/**
 * Execute RESEARCH phase - Multi-agent research.
 */
export async function executeResearch(
  _deps: SelfDevWorkflowDependencies,
  _state: SelfDevWorkflowState,
  _analyze: AnalyzeOutput
): Promise<ResearchOutput> {
  const startTime = Date.now();
  // Placeholder: will await research agent calls
  await Promise.resolve();

  // TODO: Implement multi-agent research
  // - Codebase exploration using modelAdapter
  // - Academic paper search
  // - Documentation lookup
  // - Git history analysis
  logger.info('RESEARCH phase: using placeholder (multi-agent research pending)');

  return {
    codebase: { relevantFiles: [], existingPatterns: [], interfaces: [], testPatterns: [] },
    academic: { papers: [] },
    docs: { officialDocs: [], bestPractices: [], relatedGuides: [] },
    history: { relatedIssues: [], relatedPRs: [], previousAttempts: [], relevantCommits: [] },
    synthesizedContext: 'Placeholder - implement with research agents',
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Phase 3: PLAN (TRINITY)
// =============================================================================

/**
 * Execute PLAN phase - TRINITY Thinker/Worker/Verifier planning.
 */
export async function executePlan(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  analyze: AnalyzeOutput,
  research: ResearchOutput
): Promise<PlanOutput> {
  const startTime = Date.now();
  // Placeholder: will await TRINITY protocol
  await Promise.resolve();

  // Build task description from analysis and research
  const taskDescription = buildPlanTaskDescription(analyze, research);

  // If TrinityCoordinator is available, use it
  if (deps.trinity !== undefined) {
    logger.info('PLAN phase: TrinityCoordinator available');
    // TODO: Create agent wrapper and call trinity.execute()
    // const agent = createSimpleAgent(deps, 'planner', 'thinker');
    // const task = { id: 'plan', description: taskDescription, context: {} };
    // const result = await deps.trinity.execute({ task, agent });
    // if (result.ok) { ... use result.value }
  } else {
    logger.info('PLAN phase: TrinityCoordinator not injected, using placeholder');
  }

  // Extract plan config if provided
  const config = state.config.phases?.plan;

  return {
    trinityResult: {
      success: true,
      finalOutput: `Plan for: ${analyze.selectedIssue.title}\n${taskDescription}`,
      thinkerOutput: {
        problemAnalysis: `Analysis of issue #${String(analyze.selectedIssue.number)}: ${analyze.selectedIssue.title}`,
        approach: 'Approach derived from research context',
        considerations: analyze.selectedIssue.risks,
        successCriteria: ['All tests pass', 'Lint clean', 'Type safe'],
      },
      workerOutput: {
        implementation: 'Implementation plan placeholder',
        stepsCompleted: [],
        deviations: [],
        questions: [],
      },
      verifierOutput: {
        verdict: 'pass',
        correctnessCheck: 'Placeholder verification',
        qualityCheck: 'Placeholder quality check',
        issuesFound: [],
        recommendations: [],
      },
      iterations: config?.maxIterations ?? 1,
      totalDurationMs: Date.now() - startTime,
      history: [],
      stopReason: 'verified',
    },
    plan: buildImplementationPlan(analyze, research),
    iterations: 1,
    verified: true,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Build task description for TRINITY planning from analysis and research.
 */
function buildPlanTaskDescription(analyze: AnalyzeOutput, research: ResearchOutput): string {
  const issue = analyze.selectedIssue;
  const parts = [
    `Create implementation plan for: ${issue.title}`,
    '',
    '## Issue Details',
    `Number: #${String(issue.number)}`,
    `Type: ${issue.type}`,
    `Complexity: ${String(issue.complexity)}/5`,
    `Estimated Effort: ${issue.estimatedEffort}`,
    '',
    '## Description',
    issue.body || 'No description provided',
    '',
    '## Research Context',
    research.synthesizedContext,
    '',
    '## Dependencies',
    issue.dependencies.length > 0 ? issue.dependencies.join('\n') : 'None identified',
    '',
    '## Known Risks',
    issue.risks.length > 0 ? issue.risks.join('\n') : 'None identified',
  ];
  return parts.join('\n');
}

/**
 * Build implementation plan structure from analysis and research.
 */
function buildImplementationPlan(
  analyze: AnalyzeOutput,
  _research: ResearchOutput
): ImplementationPlan {
  return {
    problemAnalysis: `Issue #${String(analyze.selectedIssue.number)}: ${analyze.selectedIssue.title}`,
    successCriteria: ['All tests pass', 'Lint passes', 'Type check passes', 'Build succeeds'],
    files: [],
    interfaces: [],
    dependencies: analyze.selectedIssue.dependencies,
    testPlan: 'Add unit tests for new functionality',
  };
}

// =============================================================================
// Phase 4: REFINE (Reflexion)
// =============================================================================

/**
 * Execute REFINE phase - Multi-persona reflexion critique.
 */
export async function executeRefine(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  plan: PlanOutput
): Promise<RefineOutput> {
  const startTime = Date.now();
  // Placeholder: will await Reflexion protocol
  await Promise.resolve();

  // If ReflexionProtocol is available, use it
  if (deps.reflexion !== undefined) {
    logger.info('REFINE phase: ReflexionProtocol available');
    // TODO: Create agents map and call reflexion.execute()
    // const agents = new Map<string, IAgent>();
    // const config = { sessionId: 'refine', task, experts: [...] };
    // const result = await deps.reflexion.execute(config, agents);
    // if (result.ok) { ... use result.value }
  } else {
    logger.info('REFINE phase: ReflexionProtocol not injected, using placeholder');
  }

  // Extract refine config if provided
  const config = state.config.phases?.refine;

  // Generate placeholder critiques from personas
  const critiques = SELF_DEV_PERSONAS.map((persona) => {
    const focusArea = persona.focusAreas[0] ?? 'key';
    return {
      personaId: persona.id,
      role: persona.role,
      issues: [],
      suggestions: [`Consider ${focusArea} aspects`],
      severity: 0.1,
    };
  });

  return {
    reflexionResult: {
      rounds: [],
      finalOutput: plan.trinityResult.finalOutput,
      totalIterations: config?.maxIterations ?? 1,
      converged: true,
      terminationReason: 'converged',
      totalDurationMs: Date.now() - startTime,
    },
    refinedPlan: plan.plan,
    critiques,
    iterations: 1,
    converged: true,
    finalSeverity: 0,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Phase 5: VOTE (Consensus)
// =============================================================================

/**
 * Execute VOTE phase - Consensus voting.
 */
export async function executeVote(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<VoteOutput> {
  const startTime = Date.now();
  // Placeholder: will await Consensus protocol
  await Promise.resolve();

  // If ConsensusProtocol is available, use it
  if (deps.consensus !== undefined) {
    logger.info('VOTE phase: ConsensusProtocol available');
    // TODO: Wire up consensus protocol
    // const config = { sessionId: 'vote', proposal: refine.refinedPlan, ... };
    // const result = await deps.consensus.execute(config, agents);
    // if (result.ok) { ... use result.value }
  } else {
    logger.info('VOTE phase: ConsensusProtocol not injected, using placeholder');
  }

  // Extract vote config if provided
  const config = state.config.phases?.vote;
  const minVotes = config?.minVotes ?? 4;

  // Generate placeholder votes from personas
  const votes = SELF_DEV_PERSONAS.slice(0, minVotes + 1).map((persona, index) => ({
    type: 'vote' as const,
    expertId: persona.id,
    decision: index < minVotes ? ('approve' as const) : ('reject' as const),
    reasoning: `${persona.role} review: ${refine.finalSeverity < 0.3 ? 'Plan meets quality threshold' : 'Minor concerns remain'}`,
    agentRole: persona.role,
    hasVetoPower: persona.id === 'security',
  }));

  const approvalCount = votes.filter((v) => v.decision === 'approve').length;
  const rejectCount = votes.filter((v) => v.decision === 'reject').length;
  const consensus = approvalCount >= minVotes;

  return {
    votes,
    approvalCount,
    rejectCount,
    abstainCount: 0,
    consensus,
    vetoExercised: false,
    verdict: consensus ? 'APPROVED' : 'REQUIRES_REVISION',
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Phase 7: IMPLEMENT (Self-Debug + Self-Refine)
// =============================================================================

/**
 * Execute IMPLEMENT phase - Self-Debug and Self-Refine code generation.
 */
export async function executeImplement(
  deps: SelfDevWorkflowDependencies,
  _state: SelfDevWorkflowState,
  refine: RefineOutput
): Promise<ImplementOutput> {
  const startTime = Date.now();
  // Placeholder: will await SelfDebug/SelfRefine protocols
  await Promise.resolve();

  // If SelfDebugProtocol is available, use it
  if (deps.selfDebug !== undefined) {
    logger.info('IMPLEMENT phase: SelfDebugProtocol available');
    // TODO: Wire up self-debug protocol
    // const config = { task, agent, testRunner: ... };
    // const result = await deps.selfDebug.execute(config);
    // if (result.ok) { ... use result.value }
  } else {
    logger.info('IMPLEMENT phase: SelfDebugProtocol not injected');
  }

  // If SelfRefineProtocol is available, use it
  if (deps.selfRefine !== undefined) {
    logger.info('IMPLEMENT phase: SelfRefineProtocol available');
    // TODO: Wire up self-refine protocol
    // const config = { task, agent, criticAgent };
    // const result = await deps.selfRefine.execute(config);
    // if (result.ok) { ... use result.value }
  } else {
    logger.info('IMPLEMENT phase: SelfRefineProtocol not injected');
  }

  // Generate placeholder implementation based on refined plan
  const filesFromPlan = refine.refinedPlan.files.map((f) => f.path);

  return {
    filesCreated: filesFromPlan.filter((_f, i) => i % 2 === 0),
    filesModified: filesFromPlan.filter((_f, i) => i % 2 === 1),
    failedFiles: [],
    selfRefineIterations: 0,
    selfDebugIterations: 0,
    success: true,
    summary: `Implementation placeholder for ${String(refine.refinedPlan.files.length)} files`,
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Phase 8: VERIFY
// =============================================================================

/**
 * Execute VERIFY phase - Quality verification checks.
 */
export async function executeVerify(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState
): Promise<VerifyOutput> {
  const startTime = Date.now();
  const cwd = state.config.workingDirectory ?? process.cwd();

  // Run verification commands
  const checkResults = await runAllVerificationChecks(cwd);

  // Convert to VerifyCheck format
  const checks = checkResults.map((r) => ({
    name: r.name,
    command: r.command,
    passed: r.passed,
    durationMs: r.durationMs,
    ...(r.output !== undefined && { output: r.output }),
  }));

  const allPassed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed);

  logger.info('VERIFY phase completed', {
    allPassed,
    passedCount: checks.filter((c) => c.passed).length,
    totalCount: checks.length,
  });

  const output: VerifyOutput = {
    checks,
    allPassed,
    coverage: 80, // TODO: Extract actual coverage from test output
    durationMs: Date.now() - startTime,
  };

  if (!allPassed && failedChecks.length > 0) {
    const failedNames = failedChecks.map((c) => c.name).join(', ');
    return { ...output, failureReport: `Failed checks: ${failedNames}` };
  }

  return output;
}

// =============================================================================
// Phase 9: COMMIT
// =============================================================================

/**
 * Execute COMMIT phase - Branch, commit, and PR creation.
 */
export async function executeCommit(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  outputs: SelfDevWorkflowResult['outputs']
): Promise<CommitOutput> {
  const startTime = Date.now();
  // Placeholder: will await Git/GitHub client calls
  await Promise.resolve();

  // Check if Git and GitHub clients are available
  if (deps.gitClient !== undefined) {
    logger.info('COMMIT phase: Git client available');
    // TODO: Wire up git client
    // await deps.gitClient.createBranch(branch);
    // await deps.gitClient.commit(message);
  } else {
    logger.info('COMMIT phase: Git client not injected');
  }

  if (deps.githubClient !== undefined) {
    logger.info('COMMIT phase: GitHub client available');
    // TODO: Wire up GitHub client
    // const pr = await deps.githubClient.createPR({ title, body, branch });
  } else {
    logger.info('COMMIT phase: GitHub client not injected');
  }

  // Generate branch name from issue
  const issueNumber = outputs.analyze?.selectedIssue.number ?? 0;
  const issueTitle = outputs.analyze?.selectedIssue.title ?? 'self-dev';
  const sluggedTitle = issueTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 30);
  const branch = `self-dev/${String(issueNumber)}-${sluggedTitle}`;

  return {
    branch,
    commitSha: '0000000',
    prNumber: 0,
    prUrl: `https://github.com/${state.config.repository}/pull/0`,
    status: 'created',
    durationMs: Date.now() - startTime,
  };
}

// =============================================================================
// Helper: Create Agent Wrapper
// =============================================================================

/**
 * Create a simple agent wrapper for use with protocols.
 * This bridges the IModelAdapter to IAgent interface.
 */
export function createSimpleAgent(
  deps: SelfDevWorkflowDependencies,
  agentId: string,
  role: string
): IAgent {
  return {
    id: agentId,
    role: role as IAgent['role'],
    state: 'idle',
    capabilities: [AgentCapability.TASK_EXECUTION],
    async execute(task: Task) {
      const response = await deps.modelAdapter.complete({
        messages: [{ role: 'user', content: task.description }],
        systemPrompt: `You are a ${role} agent.`,
      });
      if (!response.ok) {
        return { ok: false as const, error: response.error };
      }
      const content = response.value.content[0];
      const output = content?.type === 'text' ? content.text : '';
      return {
        ok: true as const,
        value: {
          taskId: task.id,
          output,
          metadata: {
            durationMs: 0,
            tokensUsed: response.value.usage.totalTokens,
            toolsUsed: [],
            model: 'self-dev',
          },
        },
      };
    },
    handleMessage(_msg: AgentMessage) {
      return Promise.resolve(ok({ messageId: 'msg-0', status: 'completed' as const }));
    },
    initialize(_ctx: AgentContext) {
      return Promise.resolve(ok(undefined));
    },
    cleanup() {
      return Promise.resolve();
    },
  };
}
