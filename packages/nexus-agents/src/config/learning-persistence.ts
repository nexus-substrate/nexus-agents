/**
 * Shared configuration for cross-session learning persistence.
 *
 * Controls where learning data (outcomes, distilled rules) is stored
 * on disk and whether persistence is enabled via feature flag.
 *
 * @module config/learning-persistence
 * (Source: Issue #1009 — Cross-session persistence)
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getNexusDataDir } from './nexus-data-dir.js';

// ============================================================================
// Path resolution (#2316: must read NEXUS_DATA_DIR at call time, not import)
// ============================================================================

/**
 * Base directory for learning persistence data. Resolved at call time so
 * `NEXUS_DATA_DIR` overrides take effect — the const-at-import-time
 * pattern this replaces was the bug discovered while dogfooding v2.63.0
 * (#2316). Outcome counts on a fresh portable workspace were leaking
 * the host home directory's outcome history.
 */
export function getLearningDir(): string {
  return join(getNexusDataDir(), 'learning');
}

/** JSONL file for persisted task outcomes. */
export function getOutcomesFile(): string {
  return join(getLearningDir(), 'outcomes.jsonl');
}

/** JSON file for persisted distilled rules. */
export function getRulesFile(): string {
  return join(getLearningDir(), 'rules.json');
}

/**
 * JSONL file for per-voter pr_review eval verdicts (#3848).
 *
 * Stores ONLY rubric-scored per-voter TP/FP/FN tallies vs ground truth — never
 * raw diffs, prompts, or model outputs. Lets per-voter precision/recall accrue
 * across runs so a chronically-noisy-voter demotion (Epic D / ADR-0017) has
 * citable evidence.
 */
export function getPrReviewEvalFile(): string {
  return join(getLearningDir(), 'pr-review-eval.jsonl');
}

/**
 * JSONL file for per-decision cost rollups (#3855).
 *
 * Stores ONLY the per-decision cost summary (per-voter / per-model token + USD
 * totals) for a governed `consensus_vote` / `pr_review` run — never raw
 * proposals, diffs, prompts, or model outputs. Lets "what did this governed
 * decision cost?" be answered from recorded data (epic #3854; feeds Epic G's
 * weather_report + manifest cost profiles in #3856).
 */
export function getDecisionCostFile(): string {
  return join(getLearningDir(), 'decision-costs.jsonl');
}

/**
 * JSONL file for the MetaOrchestrator shadow selector's training outcomes
 * (#3593). Stores ONLY numeric/categorical bandit-feature values + a boolean
 * success flag — never raw task text. Lets the shadow selector learn across
 * processes by replaying past outcomes on construction.
 */
export function getMetaOutcomesFile(): string {
  return join(getLearningDir(), 'meta-outcomes.jsonl');
}

/**
 * JSONL file for route-time model-selection shadow comparisons (#4197).
 *
 * Stores ONLY the sanitized comparison — CLI slot, difficulty tier, the model
 * actually used vs the model `resolveModelForTier` WOULD have picked, agreement,
 * outcome success, and (where measured) costUsd — never task content, prompts,
 * or model outputs. A DEDICATED log (mirroring `meta-outcomes.jsonl`, #3593)
 * rather than extra OutcomeStore fields, so the shadow eval never re-reads the
 * OutcomeStore that weather + LinUCB warm-start already replay (the pre-existing
 * double-counting boundary excluded from #4194).
 */
export function getModelSelectionShadowFile(): string {
  return join(getLearningDir(), 'model-selection-shadow.jsonl');
}

// Note: previous LEARNING_DIR / OUTCOMES_FILE / RULES_FILE exports were
// removed in #2316 — they were evaluated at module import time and ignored
// `NEXUS_DATA_DIR`. All callers must use the getter functions above.

/** Directory mode: owner-only (rwx------). */
const DIR_MODE = 0o700;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check whether learning persistence is enabled via feature flag.
 *
 * Defaults to true — cross-session LinUCB routing data persists to
 * `~/.nexus-agents/learning/` unless explicitly disabled.
 * Only routing metadata is stored (model, success, duration, category).
 * No user prompts, API keys, or model outputs are persisted.
 *
 * Set NEXUS_PERSIST_LEARNING=false to disable.
 */
export function isPersistenceEnabled(): boolean {
  return process.env['NEXUS_PERSIST_LEARNING'] !== 'false';
}

/** Ensure the learning data directory exists. */
export function ensureLearningDir(dir?: string): void {
  mkdirSync(dir ?? getLearningDir(), { recursive: true, mode: DIR_MODE });
}
