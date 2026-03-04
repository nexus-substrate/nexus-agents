/**
 * Research Alignment Map
 *
 * Maps technique names from the research registry to canonical code paths
 * in the nexus-agents codebase. Used by research synthesis to determine
 * which paper techniques are implemented, partially implemented, or new.
 *
 * @module cli/research-alignment-map
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */

// =============================================================================
// TYPES
// =============================================================================

/** Implementation status for a mapped technique. */
export interface TechniqueMapping {
  readonly status: 'implemented' | 'partial';
  readonly path: string;
  readonly hint?: string | undefined;
}

/** A feature gate that controls an implementation. */
export interface FeatureGate {
  /** Environment variable or config key. */
  readonly envVar: string;
  /** Default value when not explicitly set. */
  readonly defaultValue: string;
  /** Brief description of what the gate controls. */
  readonly description: string;
  /** Related technique names from the alignment map (if any). */
  readonly techniques?: readonly string[];
}

// =============================================================================
// MAP
// =============================================================================

/**
 * Maps technique names to canonical code paths.
 * 'implemented' = full implementation exists matching the technique.
 * 'partial' = related code exists but doesn't fully implement the technique.
 */
export const TECHNIQUE_IMPLEMENTATION_MAP: ReadonlyMap<string, TechniqueMapping> = new Map([
  // Routing techniques
  ['linucb-routing', { status: 'implemented', path: 'cli-adapters/linucb-bandit.ts' }],
  ['topsis-routing', { status: 'implemented', path: 'cli-adapters/topsis-router.ts' }],
  [
    'cascade-routing',
    { status: 'implemented', path: 'routing/stages/confidence-cascade-stage.ts' },
  ],
  [
    'complexity-based-routing',
    { status: 'implemented', path: 'routing/stages/confidence-cascade-stage.ts' },
  ],
  [
    'moe-routing',
    {
      status: 'partial',
      path: 'cli-adapters/composite-router.ts',
      hint: 'MoE pattern partially implemented via multi-stage pipeline',
    },
  ],
  ['two-stage-routing', { status: 'implemented', path: 'cli-adapters/composite-router-stages.ts' }],
  [
    'capability-instruction-tuning',
    {
      status: 'partial',
      path: 'routing/stages/capability-match-stage.ts',
      hint: 'Static capability profiles, not instruction-tuned',
    },
  ],
  [
    'knn-routing',
    {
      status: 'partial',
      path: 'context/routing-memory.ts',
      hint: 'Memory-based routing uses similarity but not KNN',
    },
  ],
  ['pilot-budget-routing', { status: 'implemented', path: 'cli-adapters/budget-router.ts' }],
  [
    'tolerance-routing',
    {
      status: 'partial',
      path: 'routing/stages/quality-constraint-stage.ts',
      hint: 'Quality constraints set thresholds but not tolerance bands',
    },
  ],
  [
    'sater-routing',
    {
      status: 'partial',
      path: 'cli-adapters/composite-router.ts',
      hint: 'Safety-aware routing partially via quality constraints',
    },
  ],
  [
    'preference-trained-routing',
    { status: 'implemented', path: 'cli-adapters/preference-router.ts' },
  ],
  [
    'strmac-state-routing',
    {
      status: 'partial',
      path: 'context/routing-memory.ts',
      hint: 'State-based routing via memory but not full MAC',
    },
  ],
  [
    'cross-attention-routing',
    {
      status: 'partial',
      path: 'routing/stages/capability-match-stage.ts',
      hint: 'Capability matching without cross-attention mechanism',
    },
  ],

  // Consensus techniques
  ['consensus-protocol', { status: 'implemented', path: 'consensus/engine.ts' }],
  ['majority-voting', { status: 'implemented', path: 'consensus/engine.ts' }],
  ['higher-order-voting', { status: 'implemented', path: 'consensus/higher-order-strategy.ts' }],
  [
    'anti-conformity-weighting',
    { status: 'implemented', path: 'consensus/higher-order-strategy.ts' },
  ],
  [
    'agreement-based-cascading',
    {
      status: 'partial',
      path: 'consensus/engine.ts',
      hint: 'Engine supports cascading but not agreement-based triggers',
    },
  ],
  [
    'incremental-quorum',
    {
      status: 'partial',
      path: 'consensus/engine.ts',
      hint: 'Fixed quorum thresholds, not incremental',
    },
  ],
  [
    'aegean-consensus',
    { status: 'partial', path: 'consensus/engine.ts', hint: 'Byzantine tolerance not implemented' },
  ],
  [
    'cp-wbft-consensus',
    {
      status: 'partial',
      path: 'consensus/engine.ts',
      hint: 'No weighted Byzantine fault tolerance',
    },
  ],

  // Memory techniques
  ['adaptive-memory', { status: 'implemented', path: 'memory/adaptive/' }],
  ['mirix-six-type-memory', { status: 'implemented', path: 'memory/typed/' }],
  [
    'mem0-memory-architecture',
    { status: 'partial', path: 'memory/', hint: 'Multi-backend memory but not mem0 pattern' },
  ],
  [
    'graph-based-memory',
    {
      status: 'partial',
      path: 'memory/belief/',
      hint: 'Belief triples are graph-like but not full graph DB',
    },
  ],
  ['experience-memory', { status: 'implemented', path: 'memory/session/' }],
  ['hindsight-belief-memory', { status: 'implemented', path: 'memory/belief/' }],
  [
    'profile-memory',
    {
      status: 'partial',
      path: 'memory/agentic/',
      hint: 'Agentic memory stores profiles but not profile-aware retrieval',
    },
  ],
  [
    'action-memory',
    {
      status: 'partial',
      path: 'orchestration/outcomes/',
      hint: 'Outcome store tracks actions but not full action replay',
    },
  ],
  ['reflection-memory', { status: 'implemented', path: 'mcp/tools/orchestrate-reflection.ts' }],
  [
    'history-encoding',
    {
      status: 'partial',
      path: 'context/token-counter.ts',
      hint: 'Token counting exists but no learned history encoding',
    },
  ],

  // Orchestration techniques
  [
    'aflow-mcts-workflows',
    {
      status: 'partial',
      path: 'workflows/aflow/',
      hint: 'AFlow scaffolding exists but MCTS not implemented',
    },
  ],
  [
    'dynamic-agent-selection',
    { status: 'implemented', path: 'orchestration/aorchestra/agent-planner.ts' },
  ],
  ['dynamic-subagent-creation', { status: 'implemented', path: 'mcp/tools/create-expert.ts' }],
  ['role-based-protocols', { status: 'implemented', path: 'agents/expert-roles.ts' }],
  [
    'rule-based-coordination',
    { status: 'implemented', path: 'orchestration/aorchestra/worker-dispatcher.ts' },
  ],
  [
    'temporal-graph-orchestration',
    {
      status: 'partial',
      path: 'orchestration/graph/',
      hint: 'Graph workflows exist but not temporal-aware',
    },
  ],
  [
    'model-based-coordination',
    {
      status: 'partial',
      path: 'orchestration/aorchestra/',
      hint: 'Worker dispatch but not model-based coordination theory',
    },
  ],
  [
    'trinity-roles',
    {
      status: 'partial',
      path: 'agents/expert-roles.ts',
      hint: '10 expert roles, not trinity pattern',
    },
  ],
  [
    'sew-self-evolving-workflows',
    {
      status: 'partial',
      path: 'workflows/aflow/',
      hint: 'AFlow framework but no self-evolution loop',
    },
  ],
  [
    'scaling-coordination-predictor',
    {
      status: 'partial',
      path: 'orchestration/aorchestra/agent-planner.ts',
      hint: 'Wave sizing but no scaling prediction',
    },
  ],

  // Learning techniques
  [
    'self-refine-loop',
    {
      status: 'implemented',
      path: 'mcp/tools/orchestrate-dispatch.ts',
    },
  ],
  [
    'recursive-improvement',
    {
      status: 'implemented',
      path: 'mcp/tools/orchestrate-dispatch.ts',
    },
  ],
  [
    'rl-orchestrator',
    {
      status: 'partial',
      path: 'cli-adapters/linucb-bandit.ts',
      hint: 'LinUCB bandit is RL-based but not full RL orchestrator',
    },
  ],
  ['reflexion-verbal-rl', { status: 'implemented', path: 'mcp/tools/orchestrate-reflection.ts' }],
]);

// =============================================================================
// FEATURE GATE INVENTORY
// =============================================================================

/** Inventory of feature gates linked to research-aligned techniques. */
export const FEATURE_GATE_INVENTORY: readonly FeatureGate[] = [
  {
    envVar: 'NEXUS_V2_MODE',
    defaultValue: 'full',
    description: 'V2 pipeline mode (off/partial/full)',
    techniques: ['two-stage-routing', 'cascade-routing'],
  },
  {
    envVar: 'NEXUS_AORCHESTRA',
    defaultValue: 'true',
    description: 'AOrchestra dynamic agent planning',
    techniques: ['dynamic-agent-selection', 'model-based-coordination'],
  },
  {
    envVar: 'NEXUS_AORCHESTRA_DISPATCH',
    defaultValue: 'true',
    description: 'AOrchestra worker dispatch',
    techniques: ['rule-based-coordination', 'self-refine-loop'],
  },
  {
    envVar: 'NEXUS_PERSIST_LEARNING',
    defaultValue: 'true',
    description: 'Cross-session routing persistence',
    techniques: ['linucb-routing', 'preference-trained-routing', 'experience-memory'],
  },
  {
    envVar: 'NEXUS_REFLECTIVE_MEMORY',
    defaultValue: 'shadow',
    description: 'Reflective memory retrieval (shadow=default, true=full, false=off)',
    techniques: ['reflection-memory', 'adaptive-memory', 'reflexion-verbal-rl'],
  },
  {
    envVar: 'NEXUS_BILLING_MODE',
    defaultValue: 'plan',
    description: 'Cost mode (plan=strongest, api=cost-aware)',
    techniques: ['pilot-budget-routing', 'topsis-routing'],
  },
  {
    envVar: 'NEXUS_WORKER_MAX_CALLS',
    defaultValue: '6',
    description: 'Max model calls per orchestrate',
    techniques: ['self-refine-loop', 'recursive-improvement'],
  },
  { envVar: 'NEXUS_AUTH_ENABLED', defaultValue: 'true', description: 'Server authentication' },
  { envVar: 'NEXUS_REST_ENABLED', defaultValue: 'false', description: 'REST API server' },
  { envVar: 'NEXUS_EVENTBUS_ENABLED', defaultValue: 'true', description: 'EventBus A2A bridge' },
  {
    envVar: 'NEXUS_RATE_LIMIT_ENABLED',
    defaultValue: 'true',
    description: 'Token-bucket rate limiter',
  },
  {
    envVar: 'NEXUS_CIRCUIT_BREAKER_THRESHOLD',
    defaultValue: '5',
    description: 'Circuit breaker failure threshold',
  },
  {
    envVar: 'NEXUS_V2_POLICY_MODE',
    defaultValue: 'block',
    description: 'Policy enforcement (off/warn/block)',
  },
  { envVar: 'NEXUS_LOG_LEVEL', defaultValue: 'info', description: 'Logging verbosity' },
  {
    envVar: 'NEXUS_DISABLE_SESSIONS',
    defaultValue: 'false',
    description: 'Disable session tracking',
  },
  {
    envVar: 'NEXUS_DISABLE_METRICS',
    defaultValue: 'false',
    description: 'Disable metrics tracking',
  },
  {
    envVar: 'NEXUS_ALLOW_MOCK_ORCHESTRATION',
    defaultValue: 'false',
    description: 'Allow mock orchestration (test/CI)',
  },
];
