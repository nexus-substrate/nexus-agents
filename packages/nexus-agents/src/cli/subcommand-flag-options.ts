/**
 * Subcommand flags that usage text advertised but the strict global parser
 * rejected as `Unknown option` (#6693).
 *
 * Same pattern as #6678: the flag is registered in `PARSE_ARGS_CONFIG`, this
 * builder copies the parsed value into `ParsedCliArgs.options`, and the
 * command handler reads it from there. Numeric flags REFUSE a malformed value
 * rather than silently falling back to the default (the #6678 vote-flag rule).
 *
 * @module cli/subcommand-flag-options
 */

import type { ParsedCliArgs } from '../cli-types.js';

/** The raw `parseArgs` values this builder reads (`cli.ts` extends it via `Parameters`). */
interface SubcommandFlagValues {
  readonly limit?: string | undefined;
  readonly markdown: boolean;
  readonly since?: string | undefined;
  readonly until?: string | undefined;
  readonly 'task-type'?: string | undefined;
  readonly 'min-sample'?: string | undefined;
  readonly vote: boolean;
  readonly topic?: string | undefined;
  readonly status?: string | undefined;
  readonly 'create-issues': boolean;
  readonly max?: string | undefined;
  readonly generate: boolean;
  readonly check: boolean;
  readonly strict: boolean;
  readonly silent: boolean;
  readonly 'no-check-files': boolean;
  readonly skip?: string[] | undefined;
}

type SubcommandFlagOptions = Pick<
  ParsedCliArgs['options'],
  | 'limit'
  | 'markdown'
  | 'since'
  | 'until'
  | 'taskType'
  | 'minSample'
  | 'vote'
  | 'topic'
  | 'status'
  | 'createIssues'
  | 'max'
  | 'generate'
  | 'check'
  | 'strict'
  | 'silent'
  | 'noCheckFiles'
  | 'skip'
>;

/**
 * Parses a flag that must be a positive integer. Throws on anything else so
 * `--limit abc` fails loudly instead of listing the default 20.
 */
function parsePositiveInteger(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`--${flag} must be a positive integer; got '${value}'`);
  }
  return num;
}

/** Boolean switches: set only when given, so absent reads as `undefined`. */
function buildSwitches(values: SubcommandFlagValues): SubcommandFlagOptions {
  return {
    ...(values.markdown && { markdown: true }),
    ...(values.vote && { vote: true }),
    ...(values['create-issues'] && { createIssues: true }),
    // `research index --generate --check --strict --silent --no-check-files`
    ...(values.generate && { generate: true }),
    ...(values.check && { check: true }),
    ...(values.strict && { strict: true }),
    ...(values.silent && { silent: true }),
    ...(values['no-check-files'] && { noCheckFiles: true }),
  };
}

/** String-valued flags, copied through when given. */
function buildStrings(values: SubcommandFlagValues): SubcommandFlagOptions {
  const { since, until, topic, status, skip } = values;
  const taskType = values['task-type'];
  return {
    ...(since !== undefined && { since }),
    ...(until !== undefined && { until }),
    ...(taskType !== undefined && { taskType }),
    ...(topic !== undefined && { topic }),
    ...(status !== undefined && { status }),
    ...(skip !== undefined && skip.length > 0 && { skip }),
  };
}

/** Builds the #6693 subcommand options from the parsed values. */
export function buildSubcommandFlagOptions(values: SubcommandFlagValues): SubcommandFlagOptions {
  const limit = parsePositiveInteger('limit', values.limit);
  const minSample = parsePositiveInteger('min-sample', values['min-sample']);
  const max = parsePositiveInteger('max', values.max);
  return {
    ...(limit !== undefined && { limit }),
    ...(minSample !== undefined && { minSample }),
    ...(max !== undefined && { max }),
    ...buildStrings(values),
    ...buildSwitches(values),
  };
}
