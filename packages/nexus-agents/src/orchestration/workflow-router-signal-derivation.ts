/**
 * nexus-agents/orchestration — derive missing structural routing signals from
 * goal text (#3989).
 *
 * The workflow router's consensus/wave rules key on `requiresConsensus` and
 * `dependencyStructure` — structural signals a plain goal STRING never sets. So
 * goals like "we need consensus on adopting GraphQL" or "run a multi-agent wave
 * over these modules" used to fall through to the generic fallback (single-shot /
 * graph) instead of the richer strategy. This gap-fills those signals from the
 * text so AUTO selection routes them correctly.
 *
 * Two guardrails keep this safe — and here the cost-asymmetry is the OPPOSITE of a
 * dropped param: a false positive sends a cheap task to an expensive N-voter panel
 * or a parallel wave, so this biases HARD toward precision (accepting false
 * negatives, which simply degrade to today's behavior):
 *  1. Caller-provided signals are AUTHORITATIVE — a field already set (including
 *     explicitly `false`) is never overridden; this only fills `undefined`.
 *  2. The patterns fire ONLY on explicit multi-agent-ORCHESTRATION language
 *     ("need/reach consensus", "consensus vote", "multi-agent wave", "independent
 *     subtasks") — NOT on verb phrases that pervade ordinary dev goals. Deliberately
 *     EXCLUDED because they over-trigger (#3989 review): bare "vote on" (matches
 *     voting features — "let users vote on posts"), "in parallel"/"fan out"/
 *     "parallelize" (impl/perf tasks — "load these in parallel"), "should we
 *     use/adopt" (trivial local decisions — "should we use a Map"), and bare
 *     "multiple perspectives" (docs — "document from multiple perspectives").
 *
 * Consequence (documented boundary): we only auto-derive when the goal NAMES the
 * orchestration process ("consensus vote", "multi-agent wave"). A goal that merely
 * IMPLIES a group decision — "we need consensus on adopting GraphQL", "should we
 * adopt GraphQL?" — does NOT auto-route, because the same verb+"consensus" shape
 * also describes distributed-systems CODE ("reach consensus on the leader
 * election"); free-text cannot tell them apart, so the caller uses the
 * `requiresConsensus` hint / `forceStrategy` for those. False negatives here are
 * safe (degrade to today); a false positive is an expensive mis-route.
 *
 * Greenfield is intentionally NOT auto-derived: the strategy manifest gates the
 * greenfield template on a written spec ("not a plain goal string"), force-only.
 *
 * @module orchestration/workflow-router-signal-derivation
 */

import type { TaskSignals } from './workflow-router-types.js';

/**
 * Phrases that REQUEST a consensus PROCESS over a subject — "consensus
 * vote/decision/review ON|ABOUT|REGARDING|FOR <x>", "consensus panel", or
 * "multi-perspective review/decision/analysis". The required decision-subject
 * preposition is what separates the request ("consensus vote ON the DB choice")
 * from a code noun ("consensus vote endpoint", "consensus decision to the raft
 * log") — the latter has no on/about/for and so does NOT match. Also excludes
 * verb+"consensus" ("reach consensus on the leader") and bare "vote on".
 */
const CONSENSUS_INTENT =
  /\bconsensus\s+(?:vote|decision|review)\s+(?:on|about|regarding|for)\b|\bconsensus\s+panel\b|\bmulti[-\s]?perspective\s+(?:review|decision|analysis)\b/i;

/**
 * Phrases that NAME a multi-agent WAVE / explicit task-decomposition: "multi-agent
 * wave", "wave of agents", "fan out to agents/subtasks", "independent subtasks".
 * Excludes bare "in parallel" / "fan out" / "parallelize" (impl/perf), and the
 * CODE-COMPONENT names "wave scheduler" / "wave execution" / "fan out to workers"
 * (self-referential maintenance goals in this very repo — #3989 review).
 */
const WAVE_INTENT =
  /\bmulti[-\s]?agent\s+wave\b|\bwave\s+of\s+agents\b|\bfan[-\s]?out\s+(?:to\s+)?(?:agents|sub-?tasks)\b|\bindependent\s+sub-?tasks?\b/i;

/**
 * Return `signals` with `requiresConsensus` / `dependencyStructure` filled from the
 * goal text when the caller left them unset. Pure; preserves every caller-provided
 * field unchanged.
 */
export function deriveStructuralSignals(signals: TaskSignals): TaskSignals {
  const text = signals.description;
  let next = signals;
  if (next.requiresConsensus === undefined && CONSENSUS_INTENT.test(text)) {
    next = { ...next, requiresConsensus: true };
  }
  if (next.dependencyStructure === undefined && WAVE_INTENT.test(text)) {
    next = { ...next, dependencyStructure: 'independent' };
  }
  return next;
}
