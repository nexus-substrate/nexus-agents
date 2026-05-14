# Spike: fork_session / branch-comparison on the existing graph builder

**Issue:** #2665 (Epic F — Future Capabilities)
**Type:** Spike — feasibility investigation, not delivery.
**Verdict:** **PARTIAL** — the orchestration shape is expressible today; the one
real gap is outcome correlation.

---

## Question

Can the existing `GraphBuilder` + `OutcomeStore` express "fork from a shared
analysis baseline → run N divergent branches → merge findings" **without code
changes**? The motivating use case: from one shared analysis ("library X vs
library Y"), evaluate divergent options without re-running the discovery work —
useful for `supply_chain_tradeoff_panel` and `consensus_vote`.

## Findings

### 1. Fork point (one node, N independent downstream paths) — **CAN**

`GraphBuilder` already expresses a fan-out. Multiple `addEdge(from, …)` calls
from the same node create independent downstream paths, and the executor's
super-step model runs every node whose dependencies are satisfied **in
parallel** within one step (`graph-executor.ts:323-394`, `executeSuperStep` →
`executeNodes` → `mergeNodeResults`). Fan-in is symmetric: two branches each
`addEdge(branch, 'merge')` and the `merge` node runs once both complete.

There is **no dedicated join/merge node type** — convergence is implicit (a node
becomes runnable when all its inbound edges' sources have run). That is
sufficient; a named join type would be sugar, not a capability gain.

**Caveat (state namespacing).** Branches share one `GraphState` namespace and
their returned `Partial<GraphState>` updates are combined by the field reducers
(`graph-builder.ts:314-334` — `overwrite` / `append` / `customReducer`). For a
_comparison_ pattern this matters: if branch A and branch B both write
`findings`, an `overwrite` reducer makes the last writer win and an `append`
reducer blends them into one undifferentiated list. Neither preserves "A's
result vs B's result" for later comparison.

The fix is a **usage convention, not a code change**: each branch writes to a
branch-distinct key (`optionA`, `optionB`, …), or all branches `append` to one
field with each entry self-tagged by branch id. The executor is single-threaded
and deterministic — it `await`s all branch handlers, _then_ merges — so there is
no torn-write race; the only requirement is that branch handlers don't collide
on the same key with a lossy reducer. See the example below.

### 2. Outcome correlation back to the baseline — **CANNOT**

`TaskOutcomeSchema` (`packages/nexus-agents/src/orchestration/outcomes/outcome-types.ts:42-73`)
has no `baselineId` / `parentRunId` / `correlationId` field, and
`OutcomeQuerySchema` (`:75-86`) has no corresponding filter. Outcomes recorded
by branch handlers land in the append-only store as independent rows with no
ancestry link. You can run the branches, but you **cannot later ask "show me
every outcome that forked from baseline B"** to compare them as a cohort. This
is the one genuine gap.

### 3. Existing templates — **none are fork-then-merge**

The seven shipped templates are all linear or conditional-single-path:

| Template          | Source                                     | Shape                               |
| ----------------- | ------------------------------------------ | ----------------------------------- |
| `echo`            | `run-graph-workflow-templates.ts`          | 1 node                              |
| `pipeline`        | `run-graph-workflow-templates.ts`          | linear (2)                          |
| `code-review`     | `run-graph-workflow-templates.ts`          | conditional split (deep _or_ quick) |
| `security-scan`   | `run-graph-workflow-templates.ts`          | conditional split                   |
| `security-audit`  | `run-graph-workflow-multicli-templates.ts` | linear (4)                          |
| `test-generation` | `run-graph-workflow-multicli-templates.ts` | linear (4)                          |
| `documentation`   | `run-graph-workflow-multicli-templates.ts` | linear (4)                          |

`code-review` / `security-scan` _route_ to one of two nodes; they do not run
divergent branches and compare them. A fork-then-merge template would be new,
but it needs no new builder primitives.

## Runnable example — fork-then-merge today

This compiles and runs against the current `GraphBuilder` with **no source
changes**. One `baseline` node does the shared discovery; `evalA` and `evalB`
fan out and run in parallel, each writing to its **own** state key; `compare`
fans in and reads both.

```ts
import {
  GraphBuilder,
  overwrite,
  START,
  END,
} from '../../packages/nexus-agents/src/orchestration/graph/graph-builder.js';
import { executeGraph } from '../../packages/nexus-agents/src/orchestration/graph/graph-executor.js';

const build = new GraphBuilder()
  .addState('baseline', overwrite<string>(''))
  .addState('optionA', overwrite<string>('')) // branch-distinct key — no collision
  .addState('optionB', overwrite<string>(''))
  .addState('verdict', overwrite<string>(''))
  .addNode('baseline', async () => ({
    baseline: 'shared discovery: candidates X and Y, same problem framing',
  }))
  // fan-out: both branches depend only on `baseline`, not on each other
  .addNode('evalA', async (s) => ({ optionA: `eval of X given: ${String(s.baseline)}` }))
  .addNode('evalB', async (s) => ({ optionB: `eval of Y given: ${String(s.baseline)}` }))
  // fan-in: `compare` runs once both branches have produced their key
  .addNode('compare', async (s) => ({
    verdict: `compare(${String(s.optionA)} || ${String(s.optionB)})`,
  }))
  .addEdge(START, 'baseline')
  .addEdge('baseline', 'evalA')
  .addEdge('baseline', 'evalB')
  .addEdge('evalA', 'compare')
  .addEdge('evalB', 'compare')
  .addEdge('compare', END)
  .compile();

if (build.ok) {
  const result = await executeGraph(build.value, {});
  // result holds `baseline`, `optionA`, `optionB`, `verdict` — A and B are
  // separable because they never shared a key.
}
```

The discovery work (`baseline`) runs once; `evalA` / `evalB` run concurrently in
one super-step; `compare` sees both. The fork_session intent — shared baseline,
divergent branches, merged comparison — is satisfied by the existing primitives
plus the branch-namespacing convention.

## Recommendation

Do **not** build a parallel orchestration mechanism. The graph builder already
carries the orchestration shape. Two follow-ups, scoped tight:

1. **Outcome correlation (the only real gap) — filed as #2697.** Add an
   optional `baselineId: z.string().min(1).max(64).optional()` to
   `TaskOutcomeSchema`, and an optional `baselineId` filter to
   `OutcomeQuerySchema`. This follows the established additive-optional-field
   pattern the schema already uses (`wasRetried`/`triageAction` #1506,
   `routingStage`/`retryCount` #1785, `vendor`/`family` #2548, `voterRole`
   #2662) — backward-compatible, no migration. The non-trivial part is wiring:
   branch handlers must thread the baseline's id into their outcome writes. The
   design vote happens on **#2697**, not on this spike.

2. **A `fork-comparison` graph template** — optional, low value until a concrete
   tool needs it. It would package the example above as a reusable template and
   document the branch-namespacing convention so callers don't reach for a
   lossy shared-key reducer. Defer until #2666 or a tool actually asks for it.

## Consensus

`simple_majority` consensus vote on this spike conclusion: **approved, 80%**
(4 approve / 1 reject; 2 voters timed out). The dissent (Contrarian) flagged
branch state isolation — addressed above: the executor is single-threaded and
deterministic, so the concern is reducer-key collision (a usage convention),
not a concurrency race. The follow-up template in recommendation 2 makes the
convention explicit.
