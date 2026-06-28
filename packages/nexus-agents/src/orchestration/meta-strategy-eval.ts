/**
 * nexus-agents/orchestration — offline meta-strategy accuracy eval (#4095, epic #4094).
 *
 * Produces the "learned beats rules" number that the #3552 learned-selection
 * audit→enforce flip is blocked on — fully OFFLINE and DETERMINISTIC, so it needs
 * no persistent soak server and no cost-gated live run (the #3863 blocker). It also
 * doubles as a routing-accuracy regression guard with standalone value.
 *
 * HOW IT STAYS DETERMINISTIC. The rule arm (`createMetaOrchestrator().select`) and
 * the learned arm (`createLearnedStrategySelector` → a FRESH `LinUCBBandit`, whose
 * `select`/`update` are pure UCB-argmax + matrix math, no RNG/clock) are both
 * deterministic. We use a FRESH learned selector (never the `getShadowSelector()`
 * process singleton, which carries accumulated state) and a stratified, index-based
 * train/test split (no shuffling). Same corpus ⇒ identical numbers.
 *
 * THE LEARNED ARM NEEDS TRAINING. A cold bandit is uninformative, and its trained
 * state is exactly the soak that can't accrue locally — so the eval trains it
 * offline: for each TRAIN entry it records `recordOutcome(expectedStrategy, decision,
 * success=true)` (the oracle label as a positive reward), then measures `predict`
 * accuracy on the HELD-OUT test split vs the rule arm's accuracy on the same split.
 *
 * Built against the `pr-review-eval` store/scoring shape so epic #4094's child 2 can
 * extract the shared `labeled-corpus → score → readiness-verdict` primitive.
 *
 * INTERPRETING THE RESULT (intellectual honesty, for the #3552 decision):
 *  - The training reward is SYNTHESIZED from the oracle label (expected strategy =
 *    success) — a proxy for the real shadow loop, which trains on ACTUAL run
 *    outcomes. So `learnedAccuracy` is a DIRECTIONAL signal, not a production number.
 *  - On the starter 32-example train set the learned arm sits near chance (~1/8 for
 *    8 arms): a contextual bandit over 8 strategies is badly under-trained at that
 *    volume. That is itself useful evidence — it points AWAY from the enforce flip
 *    (do not enforce a selector that currently loses to rules), and it sharpens as
 *    the corpus grows toward the readiness-gate volume.
 *  - `rulesAccuracy` is the load-bearing standalone metric: a drop is a routing
 *    regression. That is what the test's regression-guard floor protects.
 *
 * @module orchestration/meta-strategy-eval
 */

import { createMetaOrchestrator, type ExecutionStrategy } from './meta-orchestrator.js';
import { createLearnedStrategySelector } from './meta-shadow-selector.js';

/** One labeled corpus entry: a goal and the strategy its documented purpose best fits. */
export interface MetaStrategyCorpusEntry {
  readonly goal: string;
  readonly expectedStrategy: ExecutionStrategy;
}

/** Per-arm accuracy over the held-out test split. */
export interface MetaStrategyEvalResult {
  readonly total: number;
  readonly trainCount: number;
  readonly testCount: number;
  /** Fraction of the test split where the rule MetaOrchestrator picked the expected strategy. */
  readonly rulesAccuracy: number;
  /** Fraction of the test split where the trained learned selector picked it. */
  readonly learnedAccuracy: number;
  /** learnedAccuracy − rulesAccuracy (the "learned beats rules" delta; >0 favors learned). */
  readonly delta: number;
}

export interface MetaStrategyEvalOptions {
  /**
   * Fraction (0,1) of EACH strategy's entries held out for test (stratified so both
   * splits cover every strategy). Default 0.25. Deterministic: the first
   * `ceil(n*(1-ratio))` entries of each strategy go to train, the rest to test.
   */
  readonly testRatio?: number;
}

/** Group corpus indices by expected strategy, preserving order. */
function groupByStrategy(
  corpus: readonly MetaStrategyCorpusEntry[]
): Map<ExecutionStrategy, MetaStrategyCorpusEntry[]> {
  const groups = new Map<ExecutionStrategy, MetaStrategyCorpusEntry[]>();
  for (const entry of corpus) {
    const list = groups.get(entry.expectedStrategy) ?? [];
    list.push(entry);
    groups.set(entry.expectedStrategy, list);
  }
  return groups;
}

/**
 * Stratified, DETERMINISTIC train/test split: within each strategy the leading
 * `(1-testRatio)` share is train, the trailing share is test. Both splits cover
 * every strategy present, with no randomness.
 */
export function splitCorpus(
  corpus: readonly MetaStrategyCorpusEntry[],
  testRatio: number
): { train: MetaStrategyCorpusEntry[]; test: MetaStrategyCorpusEntry[] } {
  const train: MetaStrategyCorpusEntry[] = [];
  const test: MetaStrategyCorpusEntry[] = [];
  for (const entries of groupByStrategy(corpus).values()) {
    const testN = Math.max(1, Math.round(entries.length * testRatio));
    const trainN = Math.max(0, entries.length - testN);
    train.push(...entries.slice(0, trainN));
    test.push(...entries.slice(trainN));
  }
  return { train, test };
}

/**
 * Run the offline learned-vs-rules accuracy eval over `corpus`. Deterministic.
 */
export function evaluateMetaStrategy(
  corpus: readonly MetaStrategyCorpusEntry[],
  options: MetaStrategyEvalOptions = {}
): MetaStrategyEvalResult {
  const testRatio = options.testRatio ?? 0.25;
  const { train, test } = splitCorpus(corpus, testRatio);

  const orchestrator = createMetaOrchestrator();
  const learned = createLearnedStrategySelector();

  // Train the learned arm: the oracle label is a positive reward for its context.
  for (const entry of train) {
    const decision = orchestrator.select({ goal: entry.goal });
    learned.recordOutcome(entry.expectedStrategy, decision, true);
  }

  // Score both arms on the held-out test split.
  let rulesCorrect = 0;
  let learnedCorrect = 0;
  for (const entry of test) {
    const decision = orchestrator.select({ goal: entry.goal });
    if (decision.strategy === entry.expectedStrategy) rulesCorrect++;
    if (learned.predict(decision).strategy === entry.expectedStrategy) learnedCorrect++;
  }

  const testCount = test.length;
  const rulesAccuracy = testCount === 0 ? 0 : rulesCorrect / testCount;
  const learnedAccuracy = testCount === 0 ? 0 : learnedCorrect / testCount;
  return {
    total: corpus.length,
    trainCount: train.length,
    testCount,
    rulesAccuracy,
    learnedAccuracy,
    delta: learnedAccuracy - rulesAccuracy,
  };
}
