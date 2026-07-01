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
 * Balanced 10 per strategy (80 total) so a 25% test split yields ≥20 held-out cases —
 * the volume the #3552 readiness gate expects ({@link evaluateMetaStrategyReadiness}:
 * volume≥20). This grew from the starter 40 (5/strategy) as the eval matured from a
 * mechanism-demonstrator into the corpus that backs the audit-mode readiness signal.
 * The corpus doubles as the routing-accuracy regression guard.
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
  {
    goal: 'explain what the useEffect hook does in one paragraph',
    expectedStrategy: 'single-shot',
  },
  { goal: 'convert this markdown table to CSV', expectedStrategy: 'single-shot' },
  {
    goal: 'rename the function calcTotal to computeTotal in cart.ts',
    expectedStrategy: 'single-shot',
  },
  { goal: 'what is the time complexity of binary search?', expectedStrategy: 'single-shot' },
  { goal: 'format this SQL query for readability', expectedStrategy: 'single-shot' },

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
  {
    goal: 'fix the memory leak in the websocket handler and make the tests green',
    expectedStrategy: 'dev-pipeline',
  },
  {
    goal: 'add a rate limiter to the API middleware with unit tests',
    expectedStrategy: 'dev-pipeline',
  },
  {
    goal: 'correct the timezone bug in the scheduler and run the test suite',
    expectedStrategy: 'dev-pipeline',
  },
  {
    goal: 'implement pagination on the users endpoint with tests and typecheck',
    expectedStrategy: 'dev-pipeline',
  },
  {
    goal: 'fix the flaky retry test in queue.ts and keep lint clean',
    expectedStrategy: 'dev-pipeline',
  },

  // pipeline — multi-stage templated audit/general
  { goal: 'run a security audit of the payments module', expectedStrategy: 'pipeline' },
  { goal: 'do a full quality audit of the API layer', expectedStrategy: 'pipeline' },
  { goal: 'produce an architecture review of the data pipeline', expectedStrategy: 'pipeline' },
  { goal: 'run the documentation-quality audit over the docs tree', expectedStrategy: 'pipeline' },
  { goal: 'perform a compliance audit of the logging subsystem', expectedStrategy: 'pipeline' },
  { goal: 'run a performance audit of the checkout flow', expectedStrategy: 'pipeline' },
  { goal: 'do a dependency-vulnerability audit of the whole repo', expectedStrategy: 'pipeline' },
  { goal: 'produce an accessibility audit of the web frontend', expectedStrategy: 'pipeline' },
  { goal: 'run a code-quality audit across the billing service', expectedStrategy: 'pipeline' },
  { goal: 'perform a test-coverage audit of the core package', expectedStrategy: 'pipeline' },

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
  {
    goal: 'build a workflow that runs A then branches to B or C based on the security-scan verdict',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'create a DAG where build and lint run in parallel then merge into a gated deploy step',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'design a workflow with a retry-loop edge back to the fetch step on transient failure',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'wire a pipeline that skips the migration step when the schema-check passes',
    expectedStrategy: 'graph-workflow',
  },
  {
    goal: 'orchestrate a conditional graph: on approval go to publish, otherwise route to a rework node',
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
  {
    goal: 'spawn a swarm of agents to add type annotations across every module in parallel',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'fan out a wave of agents to update the copyright header in each file',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'use a multi-agent pattern to generate unit tests for each untested component concurrently',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'dispatch parallel agents to translate the docs into each supported language',
    expectedStrategy: 'orchestrate',
  },
  {
    goal: 'run a fan-out of agents to bump the dependency version in every package independently',
    expectedStrategy: 'orchestrate',
  },

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
  { goal: 'hold a vote on which cloud provider to standardize on', expectedStrategy: 'consensus' },
  {
    goal: 'get a consensus decision on whether to drop support for Node 18',
    expectedStrategy: 'consensus',
  },
  {
    goal: 'run a multi-perspective panel to decide the caching strategy',
    expectedStrategy: 'consensus',
  },
  { goal: 'we need a consensus vote on the proposed pricing model', expectedStrategy: 'consensus' },
  {
    goal: 'gather multiple expert opinions and vote on the rollout timeline',
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
  {
    goal: 'build a new authentication service from scratch following this specification',
    expectedStrategy: 'spec',
  },
  {
    goal: 'scaffold a greenfield mobile backend from the attached spec document',
    expectedStrategy: 'spec',
  },
  {
    goal: 'implement a brand-new billing engine from this written spec',
    expectedStrategy: 'spec',
  },
  {
    goal: 'create a new GraphQL gateway from scratch per the provided spec',
    expectedStrategy: 'spec',
  },
  {
    goal: 'build the greenfield analytics dashboard from this specification',
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
  {
    goal: 'research the current best practices for prompt caching across LLM providers',
    expectedStrategy: 'research',
  },
  {
    goal: 'compare and evaluate message-queue technologies for our throughput needs',
    expectedStrategy: 'research',
  },
  {
    goal: 'survey the state of the art in retrieval-augmented generation',
    expectedStrategy: 'research',
  },
  {
    goal: 'investigate which observability stack fits our microservices best',
    expectedStrategy: 'research',
  },
  {
    goal: 'research the tradeoffs between monorepo and polyrepo for our team',
    expectedStrategy: 'research',
  },
];
