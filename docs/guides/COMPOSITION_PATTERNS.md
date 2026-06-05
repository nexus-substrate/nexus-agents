# Composition Patterns

How to compose nexus-agents' orchestration primitives into pipelines beyond the
built-in MCP tools. The engine ships three orthogonal building blocks —
**spec parsing/decomposition**, the **graph workflow engine** (`GraphBuilder` +
`executeGraph`), and the **consensus engine** — plus a high-level
`run_dev_pipeline` for the common plan→vote→implement→QA flow. This guide shows
when to reach for each and gives three worked, type-accurate examples.

> Source issue: [#3264](https://github.com/nexus-substrate/nexus-agents/issues/3264).
> Every example below is wired against the real exported signatures. All symbols
> are re-exported from the package root, so you import everything from
> `'nexus-agents'` (the package exposes a single entry point, not per-module
> subpaths).

---

## When to use which entry point

| You want to…                                                               | Use                                         | Why                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Run the standard plan → vote → implement → QA → security loop              | `run_dev_pipeline` (MCP) / `runDevPipeline` | Batteries-included; iteration caps, vote gating, and QA loop already wired.             |
| Turn a markdown spec into a DAG and execute it end-to-end                  | `executeSpec` / `execute_spec` (MCP)        | One call: `parseSpec → decomposeSpec → compileSpecToGraph → executeGraph → validate`.   |
| Build a **custom** control flow (branches, fan-out/fan-in, loops, retries) | `GraphBuilder` + `executeGraph`             | Full control over nodes, edges, conditional routing, and per-node timeout/retry/verify. |
| Get N agents to agree on a proposal (approve/reject with quorum)           | `createConsensusEngine`                     | Standalone quorum/threshold voting; pluggable algorithm + incremental voter expansion.  |
| Route a single ad-hoc task to the best model                               | `orchestrate` (MCP)                         | `CompositeRouter` picks the model; no pipeline scaffolding.                             |

The three primitives are intentionally independent (no circular dependencies),
so you can wire them in novel orders. The examples below cover the three most
common compositions.

---

## Pattern 1 — Spec → graph → execute (the spec pipeline)

`executeSpec` is the canonical full-pipeline helper. It parses a markdown spec,
decomposes it into a task DAG, compiles that DAG into an executable graph, runs
it, and validates the outputs against the spec's acceptance criteria — each
stage short-circuiting to a typed `Result` error on failure.

```ts
import { executeSpec } from 'nexus-agents';

const markdown = `
# Add rate limiting

## Requirements
- Token-bucket limiter on the public API
- Configurable per-route limits

## Acceptance Criteria
- Requests over the limit get HTTP 429
`;

// Default handlerFactory produces dry-run placeholder handlers — swap it for
// real node handlers (see Pattern 2) to actually execute work.
const result = await executeSpec(markdown);

if (!result.ok) {
  // result.error.stage is one of: 'parse' | 'decompose' | 'compile' | 'execute' | 'validate'
  console.error(`spec failed at ${result.error.stage}: ${result.error.message}`);
} else {
  const { dag, outputs, validation, durationMs } = result.value;
  console.log(
    `${dag.nodes.length} tasks, ${validation.metCount}/${validation.totalCriteria} criteria met in ${durationMs}ms`
  );
}
```

**Inject real work** via the `handlerFactory` option (a
`SpecExecutionOptions` = `CompileOptions`). The factory receives each
`SubtaskNode` and returns an async node handler:

```ts
import { executeSpec } from 'nexus-agents';

const result = await executeSpec(markdown, {
  handlerFactory: (node) => async (state) => {
    // Call your real executor here (e.g. an adapter, the delegate_to_model MCP
    // tool, or a CLI). `node` is the SubtaskNode; `state` is the live graph state.
    const output = await runMyAgent(node.description);
    // Return a partial state patch; the graph's state reducers merge it.
    return { results: [output] };
  },
});
```

Use this pattern when your work is naturally spec-shaped (requirements +
acceptance criteria) and you want decomposition + validation for free.

---

## Pattern 2 — Custom graph workflow with `GraphBuilder`

When the control flow isn't a linear spec — you need explicit branches,
parallel fan-out, fan-in/merge, loops, or per-node retry/timeout — build the
graph directly. `GraphBuilder` is a fluent builder; `compile()` returns a
`Result<CompiledGraph, GraphCompileError>`, and `executeGraph` runs it.

```ts
import { GraphBuilder, executeGraph, overwrite, append, START, END } from 'nexus-agents';

// State channels declare how concurrent node outputs are reduced.
//   overwrite(initial) → last write wins
//   append<T>()        → concatenate (safe for parallel fan-in)
const built = new GraphBuilder()
  .addState('value', overwrite(0))
  .addState('results', append<string>())
  // Fan out from START to two parallel nodes…
  .addNode('fetch', () => Promise.resolve({ results: ['fetched'] }))
  .addNode('analyze', (state) => Promise.resolve({ value: (state['value'] as number) + 10 }))
  // …then merge.
  .addNode('merge', (state) => Promise.resolve({ results: [`merged:${String(state['value'])}`] }))
  .addEdge(START, 'fetch')
  .addEdge(START, 'analyze')
  .addEdge('fetch', 'merge')
  .addEdge('analyze', 'merge')
  .addEdge('merge', END)
  .compile();

if (!built.ok) throw new Error(`graph compile failed: ${built.error.message}`);

const exec = await executeGraph(built.value, { value: 0, results: [] });
if (exec.ok) {
  console.log(exec.value.finalState['results']); // → ['fetched', 'merged:10']
  console.log(`${String(exec.value.stepsExecuted)} steps, ${String(exec.value.totalDurationMs)}ms`);
}
```

**Conditional routing** (loops / branches) uses `addConditionalEdge(from,
router, targets)`, where `router(state)` returns the key of the next node.
Per-node resilience is configured on `addNode(id, handler, { timeout, retries,
preconditions, verify })`. Because `append` reducers are commutative, parallel
fan-in is race-free without manual locking.

Use this pattern for bespoke control flow the spec pipeline can't express.

---

## Pattern 3 — Consensus-gated decision

The consensus engine is standalone: create it, `propose()` a decision, collect
`vote()`s from your agents/voters, and read the `getResult()` (or `close()` to
finalize). It is independent of the graph engine, so you can gate any
step — a graph node, a pipeline stage, or an ad-hoc choice — behind a quorum.

```ts
import { createConsensusEngine } from 'nexus-agents';
import type { Vote } from 'nexus-agents';

const engine = createConsensusEngine({ defaultTimeout: 60_000 });

const proposed = await engine.propose({
  title: 'Adopt approach B',
  description: 'Switch the limiter to a sliding-window algorithm',
  algorithm: 'simple_majority', // or 'supermajority', etc. (see ADR-0016)
  requiredVoters: ['architect', 'security', 'scope_steward'],
});
if (!proposed.ok) throw new Error(proposed.error.message);
const proposalId = proposed.value;

const vote = (decision: 'approve' | 'reject', reasoning: string): Vote => ({
  decision,
  reasoning,
  confidence: 0.8,
});

await engine.vote(proposalId, 'architect', vote('approve', 'clean boundaries'));
await engine.vote(proposalId, 'security', vote('approve', 'no new attack surface'));
await engine.vote(proposalId, 'scope_steward', vote('reject', 'scope creep'));

const outcome = await engine.close(proposalId);
if (outcome.ok) {
  // outcome.value.outcome is a ProposalStatus:
  // 'approved' | 'rejected' | 'timeout' | 'closed' | 'pending' | 'voting'
  console.log(`decision: ${outcome.value.outcome}`);
}
```

To gate a graph node behind consensus, run the engine inside a node handler and
branch on the result with `addConditionalEdge`. A higher-level
`runGraphWithConsensus()` helper that auto-inserts consensus gate nodes is
tracked in [#3267](https://github.com/nexus-substrate/nexus-agents/issues/3267)
(it needs a design decision — in-graph gate nodes vs. a post-execution vote —
plus voter/adapter wiring, so it is intentionally not yet a single call).

---

## Initialization patterns (factories vs. constructors)

The primitives differ in how you instantiate them — this is the source of the
"which need a factory?" confusion ([#3269](https://github.com/nexus-substrate/nexus-agents/issues/3269)):

| Primitive        | Construct with                                               | Notes                                                                |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Consensus engine | `createConsensusEngine(config?, logger?)`                    | Factory; equivalent to `new ConsensusEngine(config?, logger?)`.      |
| Graph            | `new GraphBuilder()` → `.compile()`                          | Builder pattern; no factory — the fluent chain _is_ the constructor. |
| Graph execution  | `executeGraph(compiled, initialState, options?)`             | Free function, not an object.                                        |
| Outcome store    | `getOutcomeStore()` (singleton) / `new OutcomeStore(config)` | Use the singleton in app code; construct directly only in tests.     |
| Spec pipeline    | `executeSpec(markdown, options?)`                            | Free function; no object to construct.                               |

Rule of thumb: **stateful services** expose a `createX()` factory or a
`getX()` singleton; **builders and free functions** don't need one. There's no
`createOutcomeStore()` because `getOutcomeStore()` already covers the singleton
case and `new OutcomeStore(config)` covers the rare custom-config case — a
bare factory wrapper would add nothing.

---

## Related

- [docs/ENTRYPOINTS.md](../ENTRYPOINTS.md) — full MCP tool + CLI reference (`execute_spec`, `run_dev_pipeline`, `consensus_vote`, `orchestrate`).
- [docs/architecture/CONSENSUS_PROTOCOLS.md](../architecture/CONSENSUS_PROTOCOLS.md) — voting algorithms and thresholds.
- [ADR-0016](../adr/0016-multi-round-consensus-voting.md) — multi-round consensus and rejection categories.
- Canonical paths for `GraphBuilder`, `ConsensusEngine`, and the pipeline internals are listed in the repo `CLAUDE.md`.
