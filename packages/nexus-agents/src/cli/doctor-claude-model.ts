/**
 * nexus-agents/cli - Pinned claude model probe for `doctor` (#6120)
 *
 * `doctor` reported the claude CLI healthy on a host whose pinned voter model
 * (`fable`, the adapter's default) was out of usage credits: it checked the
 * binary and its auth and inferred the model from those. Meanwhile every
 * claude voter seat failed and fell over to another CLI. This probe measures
 * the model itself with one short request.
 *
 * Three answers a presence check cannot give, and one honest non-answer:
 * `available` (content came back), `out-of-credits` (the CLI's durable
 * capacity text for that model), `error` (anything else the call reported),
 * and `not-probed` when the CLI is not installed — nothing was measured, so
 * nothing is claimed.
 *
 * The request disables the adapter's in-family fallback: a probe answered by
 * `opus` would report `fable` available, which is the inference this module
 * exists to replace.
 *
 * @module cli/doctor-claude-model
 */

import { getErrorMessage } from '../core/index.js';
import { isDurableCapacityText } from '../adapters/rate-limit-detector.js';
import {
  ClaudeCliAdapter,
  IN_FAMILY_FALLBACK_OPTION,
} from '../cli-adapters/adapters/claude-adapter.js';
import { getCliModelName, getDefaultModelForCli } from '../config/model-config-helpers.js';
import { getDefaultRegistry } from '../config/model-registry.js';
import { resolveClassGuardMs } from '../config/timeouts.js';
import { colors, symbols } from './ansi-output.js';
import { SERVES_PROBE_PROMPT } from './cli-readiness.js';

/** What the probe learned about the pinned model. */
export interface ClaudeModelProbe {
  /** The CLI alias that was (or would have been) requested, e.g. `fable`. */
  readonly alias: string;
  readonly status: 'available' | 'out-of-credits' | 'error' | 'not-probed';
  /** The adapter's message on `out-of-credits` / `error`, why on `not-probed`, null on `available`. */
  readonly reason: string | null;
}

/** The adapter surface the probe needs — the same shape the `--live` ladder uses. */
export interface ClaudeModelProbeTarget {
  execute(
    task: { content: string; maxTokens?: number; options?: Record<string, unknown> },
    options?: { timeoutMs?: number }
  ): Promise<{ ok: true; value: { text: string } } | { ok: false; error: { message: string } }>;
}

/**
 * The alias the adapter pins by default — the `--model` value voters actually
 * request (`fable`), not the vendor model name behind it (`claude-fable-5`).
 * Falls back to the model name for an entry without a CLI alias.
 */
function pinnedClaudeAlias(): string {
  const modelId = getDefaultModelForCli('claude');
  return getDefaultRegistry().getEntry(modelId).cliAlias ?? getCliModelName(modelId);
}

/**
 * Probe the pinned claude model with one short request.
 *
 * `installed` gates the call: an absent binary yields `not-probed`, never a
 * failure, because a failure would claim a measurement that was not taken.
 * `adapter` and `alias` are injectable so the verdicts are testable without
 * the host's CLI; the defaults are the real adapter and its default model.
 */
export async function probeClaudePinnedModel(deps: {
  readonly installed: boolean;
  readonly alias?: string;
  readonly adapter?: ClaudeModelProbeTarget;
  readonly timeoutMs?: number;
}): Promise<ClaudeModelProbe> {
  const alias = deps.alias ?? pinnedClaudeAlias();
  if (!deps.installed) {
    return { alias, status: 'not-probed', reason: 'claude CLI not installed' };
  }
  const adapter = deps.adapter ?? new ClaudeCliAdapter({ model: alias });
  const timeoutMs = deps.timeoutMs ?? resolveClassGuardMs('interactive');

  let result: Awaited<ReturnType<ClaudeModelProbeTarget['execute']>>;
  try {
    result = await adapter.execute(
      {
        content: SERVES_PROBE_PROMPT,
        maxTokens: 16,
        options: { [IN_FAMILY_FALLBACK_OPTION]: false },
      },
      { timeoutMs }
    );
  } catch (caught: unknown) {
    return { alias, status: 'error', reason: `probe threw: ${getErrorMessage(caught)}` };
  }

  if (!result.ok) {
    const status = isDurableCapacityText(result.error.message) ? 'out-of-credits' : 'error';
    return { alias, status, reason: result.error.message };
  }
  if (result.value.text.trim() === '') {
    return { alias, status: 'error', reason: 'call succeeded but returned no content' };
  }
  return { alias, status: 'available', reason: null };
}

const STATUS_LABEL: Record<ClaudeModelProbe['status'], string> = {
  available: 'available',
  'out-of-credits': 'out of credits',
  error: 'error',
  'not-probed': 'not probed',
};

/** One doctor line: `Claude model <alias>: available | out of credits | error | not probed`. */
export function formatClaudeModelLine(probe: ClaudeModelProbe): string {
  const icon =
    probe.status === 'available'
      ? `${colors.green}${symbols.check}${colors.reset}`
      : probe.status === 'not-probed'
        ? `${colors.dim}${symbols.warn}${colors.reset}`
        : `${colors.yellow}${symbols.warn}${colors.reset}`;
  const detail = probe.reason === null ? '' : ` ${colors.dim}— ${probe.reason}${colors.reset}`;
  return `${icon} Claude model ${probe.alias}: ${STATUS_LABEL[probe.status]}${detail}`;
}
