/**
 * CLI Timeout Profiles
 *
 * Delegates to `config/timeouts.ts` (canonical source, Issue #984).
 * This file provides backward-compatible re-exports.
 *
 * @module config/defaults-timeout-profiles
 */

import { CLI_TIMEOUTS, getCliTimeoutProfile, getCliTimeout } from './timeouts.js';

// ============================================================================
// Backward-compatible re-exports — delegates to config/timeouts.ts
// ============================================================================

/** CLI-specific timeout profiles. Canonical source: `config/timeouts.ts`. */
export const TIMEOUT_PROFILES = CLI_TIMEOUTS;

/** Gets timeout profile for a CLI. Canonical source: `config/timeouts.ts`. */
export const getTimeoutProfile = getCliTimeoutProfile;

/** Gets timeout by CLI and complexity. Canonical source: `config/timeouts.ts`. */
export const getTimeoutForCli = getCliTimeout;
