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
import { homedir } from 'node:os';

// ============================================================================
// Constants
// ============================================================================

/** Resolve home directory with fallback for mocked environments. */
function safeHomedir(): string {
  try {
    return homedir() || '/tmp';
  } catch {
    return '/tmp';
  }
}

/** Base directory for learning persistence data. */
export const LEARNING_DIR = join(safeHomedir(), '.nexus-agents', 'learning');

/** JSONL file for persisted task outcomes. */
export const OUTCOMES_FILE = join(LEARNING_DIR, 'outcomes.jsonl');

/** JSON file for persisted distilled rules. */
export const RULES_FILE = join(LEARNING_DIR, 'rules.json');

/** Directory mode: owner-only (rwx------). */
const DIR_MODE = 0o700;

// ============================================================================
// Helpers
// ============================================================================

/** Check whether learning persistence is enabled via feature flag. */
export function isPersistenceEnabled(): boolean {
  return process.env['NEXUS_PERSIST_LEARNING'] === 'true';
}

/** Ensure the learning data directory exists. */
export function ensureLearningDir(dir: string = LEARNING_DIR): void {
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
}
