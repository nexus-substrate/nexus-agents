/**
 * The `vote` command's bar flags at the argv boundary (#6227): `--threshold`
 * (legacy), `--strategy` and `--ratifies-pr`.
 *
 * Its own module rather than three more private parsers in `cli.ts`, which is
 * at its line and complexity caps — and because the two new flags REFUSE an
 * invalid value where the older vote parsers silently drop one. Dropping is
 * wrong here: a governor ratification whose bar was typo'd down to the
 * default, or whose binding was dropped, runs a whole panel and writes a
 * record the ledger gate reads as `no-record` or as an ordinary vote — the
 * misreport the record exists to catch. The throw reaches `main`'s parse-error
 * handler in `cli.ts`, which prints it and exits `INVALID_ARGS`.
 *
 * @module cli/vote-bar-flags
 */

import {
  VoteThresholdSchema,
  VotingStrategySchema,
  type VoteThreshold,
  type VotingStrategy,
} from '../mcp/tools/consensus-vote-types.js';
import { VoteRecordPrBindingSchema, type VoteRecordPrBinding } from '../audit/vote-record.js';

/** The raw `parseArgs` values the bar flags read. */
export interface VoteBarFlagValues {
  readonly threshold?: string | undefined;
  readonly strategy?: string | undefined;
  readonly 'ratifies-pr'?: string | undefined;
}

/** The parsed bar flags, each present only when given. */
export interface VoteBarFlags {
  readonly threshold?: VoteThreshold;
  readonly strategy?: VotingStrategy;
  readonly ratifiesPr?: VoteRecordPrBinding;
}

/**
 * Validates the legacy `--threshold`. Uses `VoteThresholdSchema` as the
 * single source of truth (#2638). An unknown value is dropped (pre-#6227
 * behaviour, kept): the engine then applies its default.
 */
function parseThreshold(value: string | undefined): VoteThreshold | undefined {
  if (value === undefined) return undefined;
  const parsed = VoteThresholdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Validates `--strategy` against `VotingStrategySchema`, the tool's own enum.
 * `--threshold` is the legacy spelling; `resolveStrategy` (the engine) lets
 * `strategy` win when both are given, exactly as it does for the MCP tool, so
 * the CLI passes both through and adds no precedence rule of its own.
 */
function parseStrategy(value: string | undefined): VotingStrategy | undefined {
  if (value === undefined) return undefined;
  const parsed = VotingStrategySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `--strategy must be one of ${VotingStrategySchema.options.join(', ')}; got '${value}'`
    );
  }
  return parsed.data;
}

/** The form `--ratifies-pr` takes; spelled once so every refusal shows it. */
const RATIFIES_PR_FORM = '<number>@<40-hex-lowercase-sha>';

/**
 * Parses `--ratifies-pr <number>@<sha>` into the tool's `ratifiesPr` shape
 * through `VoteRecordPrBindingSchema` — the same schema the MCP tool input
 * and the persisted record use, so the CLI cannot accept a binding the ledger
 * would refuse. The PR text is checked as digits BEFORE `Number()`:
 * `Number('1e3')` is the integer 1000, and the schema would accept it.
 */
function parseRatifiesPr(value: string | undefined): VoteRecordPrBinding | undefined {
  if (value === undefined) return undefined;
  const expected = `--ratifies-pr expects ${RATIFIES_PR_FORM}; got '${value}'`;
  const at = value.indexOf('@');
  if (at === -1) throw new Error(`${expected} (no '@')`);
  const prText = value.slice(0, at);
  const headSha = value.slice(at + 1);
  if (!/^\d+$/.test(prText)) {
    throw new Error(`${expected} (the PR number must be a positive integer)`);
  }
  const parsed = VoteRecordPrBindingSchema.safeParse({ pr: Number(prText), headSha });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`${expected} (${detail})`);
  }
  return parsed.data;
}

/** Parse the three bar flags; throws on an invalid `--strategy` or `--ratifies-pr`. */
export function parseVoteBarFlags(values: VoteBarFlagValues): VoteBarFlags {
  const threshold = parseThreshold(values.threshold);
  const strategy = parseStrategy(values.strategy);
  const ratifiesPr = parseRatifiesPr(values['ratifies-pr']);
  return {
    ...(threshold !== undefined && { threshold }),
    ...(strategy !== undefined && { strategy }),
    ...(ratifiesPr !== undefined && { ratifiesPr }),
  };
}
