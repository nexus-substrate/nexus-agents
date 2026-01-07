/**
 * nexus-agents/testing/tasks/definitions - Task 003
 *
 * Task 003: Large Codebase Analysis
 * Optimal for Gemini - requires processing large context.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 3: Large Codebase Analysis
 * Optimal for Gemini - requires processing large context.
 */
export const TASK_003_CODEBASE_ANALYSIS: EvaluationTask = {
  id: 'task-003',
  name: 'Large Codebase Analysis',
  category: 'codebase_analysis',
  difficulty: 'hard',
  description: 'Analyze a large codebase to identify patterns and issues.',
  prompt: `Analyze the following codebase structure and provide a comprehensive report:

\`\`\`
src/
  core/
    types/
      index.ts (200 lines - type definitions)
      model.ts (150 lines - model interfaces)
      agent.ts (180 lines - agent types)
    result.ts (120 lines - Result<T,E> pattern)
    logger.ts (90 lines - logging utilities)
  adapters/
    claude-adapter.ts (250 lines - Claude API adapter)
    openai-adapter.ts (280 lines - OpenAI adapter)
    base-adapter.ts (100 lines - abstract base)
  agents/
    tech-lead.ts (350 lines - orchestrating agent)
    expert.ts (200 lines - specialist agents)
    collaboration.ts (180 lines - multi-agent comms)
  workflows/
    engine.ts (300 lines - workflow execution)
    parser.ts (150 lines - YAML parsing)
    templates/ (10 YAML files)
  mcp/
    server.ts (200 lines - MCP server)
    tools.ts (400 lines - tool implementations)
  cli.ts (100 lines - CLI entry point)
  index.ts (50 lines - public exports)
\`\`\`

Provide:
1. Architectural overview - identify the patterns used
2. Dependency analysis - map module dependencies
3. Potential issues - file size violations, circular deps
4. Recommendations - improvements for maintainability
5. Test coverage priorities - which modules need most testing`,
  expectedOutcome: {
    mustContain: ['adapter pattern', 'dependency', 'maintainability', 'test'],
    mustNotContain: [],
    minLength: 800,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'architecture_understanding',
        description: 'Correctly identifies architectural patterns',
        weight: 0.25,
        maxScore: 10,
        indicators: ['adapter', 'factory', 'MCP', 'Result pattern'],
      },
      {
        id: 'dependency_analysis',
        description: 'Accurate dependency mapping',
        weight: 0.25,
        maxScore: 10,
        indicators: ['imports', 'depends on', 'circular'],
      },
      {
        id: 'issue_identification',
        description: 'Identifies real issues (tools.ts exceeds 400 lines)',
        weight: 0.25,
        maxScore: 10,
        indicators: ['400 lines', 'split', 'violation'],
      },
      {
        id: 'recommendations',
        description: 'Actionable improvement suggestions',
        weight: 0.25,
        maxScore: 10,
        indicators: ['recommend', 'should', 'improve'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 90000,
  optimalCli: 'gemini',
  acceptableClis: ['gemini', 'claude'],
  tags: ['analysis', 'architecture', 'code-review', 'large-context'],
};
