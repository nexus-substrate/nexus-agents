/**
 * Consensus gate node (#3267) — an in-graph consensus checkpoint.
 *
 * Generalizes the proven dev-pipeline `vote` stage pattern
 * (`createVoteStageWrapper`) into a reusable, layer-agnostic primitive: run an
 * injected voter on a proposal, produce a typed verdict, and let the caller
 * branch on it (approve → continue, reject → halt/revise) via the graph's
 * conditional edges. The voter is injected (callback), so the node is decoupled
 * from any specific voter panel — a 7/3-role consensus panel, a single model, or
 * the dev-pipeline's `stages.vote` can all satisfy {@link ConsensusVoter}.
 *
 * Both the graph adapter ({@link createConsensusGateNode}) and the pipeline
 * `vote` stage delegate to {@link runConsensusGate}, so there is ONE
 * consensus-gate implementation (anti-sprawl — #3267 vote condition), not two.
 *
 * @module orchestration/graph/consensus-node
 * (Source: #3267)
 */

import type { GraphState, NodeHandler, GraphExecutionResult } from './graph-types.js';
import { START, END, formatCompileError } from './graph-types.js';
import { GraphBuilder, overwrite } from './graph-builder.js';
import { executeGraph } from './graph-executor.js';
import { ok, err, type Result } from '../../core/index.js';

/** What a consensus voter is asked to evaluate. */
export interface ConsensusProposalInput {
  /** The proposal text under review (e.g. a plan). */
  readonly proposal: string;
  /** Optional supporting context (e.g. research) the voter may weigh. */
  readonly context?: string;
}

/** The typed verdict a consensus round produces. */
export interface ConsensusVerdict {
  /**
   * Whether the proposal cleared the consensus bar.
   *
   * `no_quorum` (#4135) is DISTINCT from `rejected`: the panel could not reach a
   * valid quorum (an errored/absent voice under the opt-in `absolute_quorum`
   * policy, or an error-policy short-circuit) — a recoverable "re-run the missing
   * voice" state, NOT the panel rejecting the proposal. A voter that maps a
   * `consensus_vote` result into a verdict should surface the vote's `decision`
   * here so `no_quorum` propagates. It is not `success` — pair the gate with a
   * conditional edge that routes `no_quorum` to a bounded re-vote/escalate rather
   * than the reject/revise path. The voter-throw fail-closed path stays `rejected`
   * (an exception is an error, not a valid quorum void). Inert until a caller opts
   * into `absolute_quorum`.
   */
  readonly outcome: 'approved' | 'rejected' | 'no_quorum';
  /** Reviewer feedback (empty on a clean approval). */
  readonly feedback: string;
  /** Optional structured detail (approval %, the raw vote, …) for consumers. */
  readonly detail?: Record<string, unknown>;
}

/** Injected voter: run a consensus round and return a verdict. */
export type ConsensusVoter = (input: ConsensusProposalInput) => Promise<ConsensusVerdict>;

/**
 * Run the consensus gate (the single shared implementation). On any voter
 * error/timeout this **fails CLOSED** to a `rejected` verdict — a gate must
 * never let unreviewed work through on an error. The voter receives only the
 * proposal/context (no secrets, no ambient state).
 */
export async function runConsensusGate(
  voter: ConsensusVoter,
  input: ConsensusProposalInput
): Promise<ConsensusVerdict> {
  try {
    return await voter(input);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      outcome: 'rejected',
      feedback: `Consensus gate failed closed (voter error): ${message}`,
      detail: { error: message },
    };
  }
}

/** Options for {@link createConsensusGateNode}. */
export interface ConsensusGateNodeOptions {
  /** The voter to run at this gate. */
  readonly voter: ConsensusVoter;
  /** Graph-state key the typed verdict is written under. */
  readonly verdictKey: string;
  /** Derive the proposal/context from graph state (no secrets/ambient state). */
  readonly proposalFrom: (state: Readonly<GraphState>) => ConsensusProposalInput;
}

/**
 * Build a {@link NodeHandler} that runs a consensus gate and writes the typed
 * verdict to `verdictKey` in graph state. Pair it with `addConditionalEdge` on
 * `state[verdictKey].outcome` to route approve → continue, reject → halt/revise.
 */
export function createConsensusGateNode(options: ConsensusGateNodeOptions): NodeHandler {
  return async (state) => {
    let input: ConsensusProposalInput;
    try {
      input = options.proposalFrom(state);
    } catch (error: unknown) {
      // A throwing proposal extractor must also fail CLOSED — never crash the
      // node (which would propagate as an un-gated graph failure).
      const message = error instanceof Error ? error.message : String(error);
      return {
        [options.verdictKey]: {
          outcome: 'rejected',
          feedback: `Consensus gate failed closed (proposal extraction error): ${message}`,
          detail: { error: message },
        } satisfies ConsensusVerdict,
      };
    }
    const verdict = await runConsensusGate(options.voter, input);
    return { [options.verdictKey]: verdict };
  };
}

/** Options for {@link runGraphWithConsensus}. */
export interface RunGraphWithConsensusOptions {
  /**
   * Work node that produces the proposal — it must write the proposal text to
   * `proposalKey` (default `'proposal'`) in its returned state patch.
   */
  readonly produce: NodeHandler;
  /** The voter run at the gate. */
  readonly voter: ConsensusVoter;
  /** State key the produce node writes the proposal to. Default `'proposal'`. */
  readonly proposalKey?: string;
  /** State key the verdict is written to. Default `'consensusVerdict'`. */
  readonly verdictKey?: string;
  /** Initial graph state. */
  readonly initialState?: GraphState;
}

/**
 * Convenience composition (#3267): run a single work node, then a consensus
 * gate over its output — `START → produce → consensus → END` — and return the
 * execution result plus the typed verdict. The `proposalKey`/`verdictKey` state
 * channels are declared automatically. For richer control flow (branch on the
 * verdict, loop on reject, multiple gates) use {@link createConsensusGateNode}
 * with {@link GraphBuilder} + `addConditionalEdge` directly.
 */
export async function runGraphWithConsensus(
  options: RunGraphWithConsensusOptions
): Promise<
  Result<{ execution: GraphExecutionResult; verdict: ConsensusVerdict | undefined }, Error>
> {
  const proposalKey = options.proposalKey ?? 'proposal';
  const verdictKey = options.verdictKey ?? 'consensusVerdict';
  const gate = createConsensusGateNode({
    voter: options.voter,
    verdictKey,
    proposalFrom: (state) => {
      const raw = state[proposalKey];
      return { proposal: typeof raw === 'string' ? raw : '' };
    },
  });
  const compiled = new GraphBuilder()
    .addState(proposalKey, overwrite(''))
    .addState(verdictKey, overwrite<ConsensusVerdict | null>(null))
    .addNode('produce', options.produce)
    .addNode('consensus', gate)
    .addEdge(START, 'produce')
    .addEdge('produce', 'consensus')
    .addEdge('consensus', END)
    .compile();
  if (!compiled.ok) {
    return err(
      new Error(
        `runGraphWithConsensus: graph compile failed: ${formatCompileError(compiled.error)}`
      )
    );
  }
  const execResult = await executeGraph(compiled.value, options.initialState ?? {});
  if (!execResult.ok) return err(execResult.error);
  const raw = execResult.value.finalState[verdictKey];
  const verdict = (raw ?? undefined) as ConsensusVerdict | undefined;
  return ok({ execution: execResult.value, verdict });
}
