/**
 * Subcommand flags that usage text advertised but the strict global parser
 * still rejected as `Unknown option` after #6705 (#6693 follow-up).
 *
 * Same mechanism as #6705's `buildDocumentedFlags`: the flag is registered in
 * `PARSE_ARGS_CONFIG`, this builder copies the parsed value into
 * `ParsedCliArgs.options`, and the command handler reads it from there.
 * `--max` REFUSES a malformed value rather than silently falling back to the
 * default (the #6678 vote-flag rule).
 *
 * @module cli/subcommand-flag-options
 */

import type { ParsedCliArgs } from '../cli-types.js';

/** The raw `parseArgs` values this builder reads (`ParsedValues` extends it). */
export interface SubcommandFlagValues {
  vote: boolean;
  topic?: string;
  status?: string;
  'create-issues': boolean;
  max?: string;
  generate: boolean;
  check: boolean;
  strict: boolean;
  silent: boolean;
  'no-check-files': boolean;
  skip?: string[];
}

type SubcommandFlagOptions = Pick<
  ParsedCliArgs['options'],
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

/** Parses `--max`, which must be a positive integer. */
function parseMax(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`--max must be a positive integer; got '${value}'`);
  }
  return num;
}

/** Boolean switches: set only when given, so absent reads as `undefined`. */
function buildSwitches(values: SubcommandFlagValues): SubcommandFlagOptions {
  return {
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

/** Builds the #6693 follow-up subcommand options from the parsed values. */
export function buildSubcommandFlagOptions(values: SubcommandFlagValues): SubcommandFlagOptions {
  const max = parseMax(values.max);
  const { topic, status, skip } = values;
  return {
    ...(topic !== undefined && { topic }),
    ...(status !== undefined && { status }),
    ...(max !== undefined && { max }),
    ...(skip !== undefined && skip.length > 0 && { skip }),
    ...buildSwitches(values),
  };
}
