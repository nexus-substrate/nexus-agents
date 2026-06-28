/**
 * nexus-agents/orchestration — labeled meta-strategy corpus (#4095, epic #4094).
 *
 * A `goal → expected ExecutionStrategy` oracle for the offline learned-vs-rules
 * accuracy eval ({@link evaluateMetaStrategy}).
 *
 * LABELING PROTOCOL (reproducible; deliberately NOT tuned to favor either arm).
 * Each goal is assigned the single ExecutionStrategy whose DOCUMENTED purpose (the
 * JSDoc on `ExecutionStrategy` in meta-orchestrator.ts) best matches the goal's
 * DOMINANT intent — judged from the goal text alone, BLIND to what the rule router
 * or the learned selector would actually pick:
 *  - `single-shot`     trivial single-step request (rename, explain, format, convert).
 *  - `dev-pipeline`    a code change that should pass the test/lint/typecheck gate.
 *  - `pipeline`        multi-stage templated work — an audit or general pipeline.
 *  - `graph-workflow`  a DAG / conditional-edge workflow (branch, fan-in, gated steps).
 *  - `orchestrate`     pattern-based MULTI-AGENT work (wave / fan-out / swarm).
 *  - `consensus`       a multi-perspective DECISION reached by a vote/panel.
 *  - `spec`            a greenfield build FROM A WRITTEN SPEC ("from scratch", "new … from this spec").
 *  - `research`        research-heavy investigation / comparison / survey.
 *
 * Balanced 5 per strategy (40 total). GROWTH TARGET: expand toward ≥80 (≥10/strategy)
 * so a 25% test split yields ≥20 held-out cases — the volume the #3552 readiness gate
 * expects (improvement-enforce-readiness: volume≥20). This starter establishes the
 * eval mechanism + the routing-accuracy regression guard.
 *
 * @module orchestration/meta-strategy-corpus
 */

import type { MetaStrategyCorpusEntry } from './meta-strategy-eval.js';

export const META_STRATEGY_CORPUS: readonly MetaStrategyCorpusEntry[] = [
  // single-shot — trivial single-step
  { goal: 'rename the variable foo to bar in utils.ts', expectedStrategy: 'single-shot' },
  { goal: 'what does the git rebase --onto flag do?', expectedStrategy: 'single-shot' },
  { goal: 'format this JSON snippet', expectedStrategy: 'single-shot' },
  { goal: 'add a one-line comment explaining this regex', expectedStrategy: 'single-shot' },
  { goal: 'convert this value from Celsius to Fahrenheit', expectedStrategy: 'single-shot' },

  // dev-pipeline — code change needing the test/lint/typecheck gate
  {
    goal: 'fix the off-by-one bug in pagination.ts and make sure the tests pass',
    expectedStrategy: 'dev-pipeline',
  },
  {
    goal: 'add input validation to the login handler with unit tests',
    expectedStrategy: 'dev-pipeline',
  },
  { goal: 'refactor the auth module and run lint and typecheck', expectedStrategy: 'dev-pipeline' },
  { goal: 'implement retry logic in the http client with tests', expectedStrategy: 'dev-pipeline' },
  {
    goal: 'patch the null-pointer in parser.ts and verify the build',
    expectedStrategy: 'dev-pipeline',
  },

  // pipeline — multi-stage templated audit/general
  { goal: 'run a security audit of the payments module', expectedStrategy: 'pipeline' },
  { goal: 'do a full quality audit of the API layer', expectedStrategy: 'pipeline' },
  { goal: 'produce an architecture review of the data pipeline', expectedStrategy: 'pipeline' },
  { goal: 'run the documentation-quality audit over the docs tree', expectedStrategy: 'pipeline' },
  { goal: 'perform a compliance audit of the logging subsystem', expectedStrategy: 'pipeline' },

  // graph-workflow — DAG / conditional-edge
  {
    goal: 'build a conditional workflow that branches on the test result then deploys or rolls back',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'orchestrate a DAG fetch then transform then validate then load, halting at the validate gate on failure',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'create a multi-stage workflow with conditional edges depending on the lint outcome',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'wire a workflow where step C runs only if both A and B succeed',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'design a graph workflow with a fan-in join after three sequential gated branches',
    expectedStrategy: 'graph-workflow',
  },

  // orchestrate — pattern-based multi-agent
  {
    goal: 'run a multi-agent wave over these modules to refactor them in parallel',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'fan out independent subtasks across the codebase to add logging',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'orchestrate a swarm of agents to triage the open issues',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'use a multi-agent pattern to migrate each service independently',
    expectedStrategy: 'orchestrate',
  },
  { goal: 'dispatch a wave of agents to audit each microservice', expectedStrategy: 'orchestrate' },

  // consensus — multi-perspective decision/vote
  { goal: 'hold a consensus vote on whether to adopt GraphQL', expectedStrategy: 'consensus' },
  { goal: 'we need a consensus decision on the database choice', expectedStrategy: 'consensus' },
  {
    goal: 'get multiple perspectives via a vote on the API redesign',
    expectedStrategy: 'consensus',
  },
  {
    goal: 'run a consensus panel on the proposed authentication change',
    expectedStrategy: 'consensus',
  },
  {
    goal: 'do a multi-perspective review and vote on the migration plan',
    expectedStrategy: 'consensus',
  },

  // spec — greenfield from a written spec
  { goal: 'build a greenfield todo app from this written spec', expectedStrategy: 'spec' },
  {
    goal: 'implement a new microservice from scratch per the attached spec document',
    expectedStrategy: 'spec',
  },
  { goal: 'create a brand-new CLI tool from this specification', expectedStrategy: 'spec' },
  { goal: 'scaffold a greenfield REST API from the provided spec', expectedStrategy: 'spec' },
  {
    goal: 'build the new notification service from scratch following the spec',
    expectedStrategy: 'spec',
  },

  // research — research-heavy investigation
  { goal: 'research the best vector database for our use case', expectedStrategy: 'research' },
  { goal: 'investigate and compare OAuth libraries for Node', expectedStrategy: 'research' },
  {
    goal: 'do a deep research report on consensus algorithms for distributed systems',
    expectedStrategy: 'research',
  },
  { goal: 'survey the landscape of LLM evaluation frameworks', expectedStrategy: 'research' },
  {
    goal: 'research which benchmarks are worth adopting for our agents',
    expectedStrategy: 'research',
  },
];
