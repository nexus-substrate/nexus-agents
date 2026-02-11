/**
 * CLI Timeout Profiles
 *
 * @deprecated Import from `config/timeouts.js` instead (Issue #984).
 * This file re-exports from the canonical source for backward compatibility.
 *
 * @module config/defaults-timeout-profiles
 */

import { CLI_TIMEOUTS, getCliTimeoutProfile, getCliTimeout } from './timeouts.js';

// ============================================================================
// Backward-compatible re-exports (deprecated)
// ============================================================================

/**
 * @deprecated Use `CLI_TIMEOUTS` from `config/timeouts.js` instead.
 */
export const TIMEOUT_PROFILES = CLI_TIMEOUTS;

/**
 * @deprecated Use `getCliTimeoutProfile()` from `config/timeouts.js` instead.
 */
export const getTimeoutProfile = getCliTimeoutProfile;

/**
 * @deprecated Use `getCliTimeout()` from `config/timeouts.js` instead.
 */
export const getTimeoutForCli = getCliTimeout;
