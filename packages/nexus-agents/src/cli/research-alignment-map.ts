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
  [
    'reflection-memory',
    {
      status: 'partial',
      path: 'memory/session/',
      hint: 'Session learnings captured but no explicit reflection loop',
    },
  ],
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
      status: 'partial',
      path: 'orchestration/aorchestra/',
      hint: 'Result synthesis but no iterative self-refinement',
    },
  ],
  [
    'recursive-improvement',
    {
      status: 'partial',
      path: 'orchestration/aorchestra/',
      hint: 'Single-pass dispatch, no recursive improvement',
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
  [
    'reflexion-verbal-rl',
    {
      status: 'partial',
      path: 'orchestration/aorchestra/',
      hint: 'Worker outcomes recorded but no verbal reflection loop',
    },
  ],
]);
