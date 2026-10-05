/** Shared reconstruction of the router's initial bandit state (#5275). */
import { getErrorMessage, getTimeProvider, type ILogger } from '../core/index.js';
import { isPersistenceEnabled } from '../config/learning-persistence.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import {
  buildSyntheticOutcomes,
  generateSyntheticPriors,
  runWarmUp,
  SYNTHETIC_MARKER,
} from '../cli/warm-up.js';
import type { LinUCBBandit } from './linucb-bandit.js';

/** Provenance of a reconstruction, never a live router snapshot. */
export interface BanditReconstruction {
  readonly reconstructedAt: string;
  /** Matched outcomes replayed in the recent window, including synthetic rows. */
  readonly outcomesReplayed: number;
  /** Recent matched outcomes without the synthetic warm-up marker. */
  readonly empiricalOutcomesReplayed: number;
  readonly lookbackDays: number;
  /** Whether the legacy cold-start fallback was invoked, even if it skipped. */
  readonly fallbackUsed: boolean;
  /** Additional all-time fallback replays, including generated synthetic rows. */
  readonly fallbackOutcomesReplayed: number;
  readonly status: 'complete' | 'failed';
}

export interface WarmStartOptions {
  /**
   * Whether the cold fallback may append synthetic warm-up rows to the
   * OutcomeStore. The router persists (default); read-only diagnostics pass
   * false and replay the identical rows in memory instead.
   */
  readonly persist?: boolean;
}

const LOOKBACK_DAYS = 30;
const LOOKBACK_MS = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/**
 * Replay recent persisted outcomes, seed specialization priors, then run the
 * legacy cold fallback if no recent outcome matched. Mutates the supplied
 * bandit. With `persist` (default) the fallback seeds the OutcomeStore through
 * runWarmUp, just as the router did before extraction; with `persist: false`
 * the same synthetic rows are replayed in memory and nothing is written. The fallback intentionally retains its all-time
 * query; both paths exclude e2e-eval. Failures preserve any partial state.
 */
export function warmStartBandit(
  bandit: LinUCBBandit,
  logger: ILogger,
  options: WarmStartOptions = {}
): BanditReconstruction {
  const reconstructedAt = getTimeProvider().nowIso();
  let replayed = 0;
  let empiricalOutcomesReplayed = 0;
  let fallbackUsed = false;
  let fallbackOutcomesReplayed = 0;
  let status: BanditReconstruction['status'] = 'complete';
  try {
    if (isPersistenceEnabled()) {
      const since = new Date(getTimeProvider().now() - LOOKBACK_MS).toISOString();
      const outcomes = getOutcomeStore().query({ since, excludeQualitySignals: ['e2e-eval'] });
      if (outcomes.length > 0) {
        replayed = bandit.warmStart(outcomes);
        empiricalOutcomesReplayed = countEmpiricalOutcomes(outcomes, bandit.getArmNames());
        logger.info('LinUCB warm-started from recent outcomes', {
          outcomesAvailable: outcomes.length,
          outcomesReplayed: replayed,
          lookbackDays: 30,
        });
      }
    }
    bandit.seedPriors(generateSyntheticPriors(), replayed === 0 ? 3 : 1);
    if (replayed === 0) {
      fallbackUsed = true;
      const fallback = options.persist === false ? memoryFallback() : persistedFallback(logger);
      if (fallback.outcomes !== undefined) {
        fallbackOutcomesReplayed = bandit.warmStart(fallback.outcomes);
      }
      logger.info('LinUCB cold-start seeded from specialization matrix', {
        syntheticOutcomes: fallback.seeded,
      });
    }
  } catch (error: unknown) {
    status = 'failed';
    logger.warn('LinUCB warm-start failed, starting cold', { error: getErrorMessage(error) });
  }
  return {
    reconstructedAt,
    outcomesReplayed: replayed,
    empiricalOutcomesReplayed,
    lookbackDays: LOOKBACK_DAYS,
    fallbackUsed,
    fallbackOutcomesReplayed,
    status,
  };
}

interface FallbackReplay {
  /** Undefined when warm-up was skipped (synthetic rows already exist). */
  readonly outcomes: readonly TaskOutcome[] | undefined;
  readonly seeded: number;
}

function persistedFallback(logger: ILogger): FallbackReplay {
  const result = runWarmUp(logger);
  if (result.skipped) return { outcomes: undefined, seeded: result.seeded };
  const outcomes = getOutcomeStore().query({ excludeQualitySignals: ['e2e-eval'] });
  return { outcomes, seeded: result.seeded };
}

/** Same decision and replay set as persistedFallback, without the append. */
function memoryFallback(): FallbackReplay {
  const store = getOutcomeStore();
  const hasSynthetic = store
    .query()
    .some((o) => o.qualitySignals?.includes(SYNTHETIC_MARKER) === true);
  if (hasSynthetic) return { outcomes: undefined, seeded: 0 };
  const synthetic = buildSyntheticOutcomes(new Date().toISOString());
  const stored = store.query({ excludeQualitySignals: ['e2e-eval'] });
  return { outcomes: [...stored, ...synthetic], seeded: synthetic.length };
}

function countEmpiricalOutcomes(outcomes: readonly TaskOutcome[], arms: readonly string[]): number {
  return outcomes.filter(
    (outcome) =>
      arms.includes(outcome.cli) && outcome.qualitySignals?.includes(SYNTHETIC_MARKER) !== true
  ).length;
}
