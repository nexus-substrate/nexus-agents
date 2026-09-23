/**
 * nexus-agents/cli-adapters - Operator-disabled CLIs (#6590)
 *
 * `NEXUS_DISABLED_CLIS=codex,gemini` takes CLIs out of service without
 * uninstalling or logging them out. The case it exists for: a CLI whose plan
 * is out of quota for days is still installed and authenticated, so detection
 * admits it, and nothing excludes it until its circuit breaker has watched
 * real calls fail — voter seats included.
 *
 * This module is the ONE reader of the variable. Every site that picks a CLI
 * arm asks {@link isCliDisabled} or {@link getDisabledClis}; none parses the
 * env itself.
 */

import { createLogger } from '../core/index.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { isCliName, type CliName } from './types.js';

const ENV_VAR = 'NEXUS_DISABLED_CLIS';
const logger = createLogger({ component: 'disabled-clis' });

/** Unknown names already warned about, so each warns once per process. */
const warnedUnknown = new Set<string>();

/** Memo keyed on the raw value, so a changed env is re-read. */
let memo: { raw: string; disabled: ReadonlySet<CliName> } | undefined;

function parse(raw: string): ReadonlySet<CliName> {
  const disabled = new Set<CliName>();
  for (const token of raw.split(',')) {
    const name = token.trim().toLowerCase();
    if (name === '') continue;
    if (isCliName(name)) {
      disabled.add(name);
    } else if (!warnedUnknown.has(name)) {
      warnedUnknown.add(name);
      logger.warn(`${ENV_VAR}: unknown CLI name ignored`, { name, known: [...CLI_NAMES] });
    }
  }
  return disabled;
}

/**
 * The CLIs disabled by `NEXUS_DISABLED_CLIS`: comma-separated, trimmed,
 * case-insensitive, validated against `CliName`. An unknown name warns once
 * and is ignored. Unset or empty disables nothing.
 */
export function getDisabledClis(): ReadonlySet<CliName> {
  const raw = process.env[ENV_VAR] ?? '';
  if (memo?.raw !== raw) memo = { raw, disabled: parse(raw) };
  return memo.disabled;
}

/** Whether `cli` is disabled. A name that is not a known CLI is never disabled. */
export function isCliDisabled(cli: string | undefined): boolean {
  return cli !== undefined && isCliName(cli) && getDisabledClis().has(cli);
}
