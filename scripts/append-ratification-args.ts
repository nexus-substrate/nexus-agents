/**
 * argv for `append-ratification-record.ts` — split out when `--as-owner`
 * (#6257) pushed the script past the 400-line limit. One selector (`--job`
 * or `--record-id`), each option with a value, `--as-owner` bare, nothing
 * unknown. Pure; the script owns the defaults it fills in.
 *
 * @module scripts/append-ratification-args
 * (Source: Issue #5130, #6257)
 */

export interface AppendArgs {
  readonly ok: true;
  readonly selector: { readonly jobId: string } | { readonly recordId: string };
  readonly sourcePath?: string;
  readonly ledgerPath?: string;
  /** `--signing-key`; the CLI falls back to `NEXUS_VOTE_SIGNING_KEY`, then the agent key, when absent. */
  readonly signingKeyPath?: string;
  /** `--as-owner`: a human is running this append, so an owner-principal signature is permitted (#6257). */
  readonly asOwner: boolean;
}

const USAGE =
  'usage: append-ratification-record.ts (--job <jobId> | --record-id <id>) [--source <path>] ' +
  '[--ledger <path>] [--signing-key <path>] [--as-owner]';

/** The one flag that takes no value. */
export const AS_OWNER_FLAG = '--as-owner';

type ArgvWalk =
  | { readonly ok: true; readonly values: Map<string, string>; readonly asOwner: boolean }
  | { readonly ok: false; readonly error: string };

/** The argv walk: each option with a value, `--as-owner` bare, nothing unknown. */
function walkAppendArgv(argv: readonly string[]): ArgvWalk {
  const values = new Map<string, string>();
  let asOwner = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (flag === AS_OWNER_FLAG) {
      asOwner = true;
      continue;
    }
    if (!['--job', '--record-id', '--source', '--ledger', '--signing-key'].includes(flag)) {
      return { ok: false, error: `unknown argument '${flag}'. ${USAGE}` };
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: `${flag} needs a value. ${USAGE}` };
    }
    values.set(flag, value);
    i++;
  }
  return { ok: true, values, asOwner };
}

/** Parse argv; exactly one selector, each option with a value (except `--as-owner`), nothing unknown. */
export function parseAppendArgs(
  argv: readonly string[]
): AppendArgs | { readonly ok: false; readonly error: string } {
  const walked = walkAppendArgv(argv);
  if (!walked.ok) return walked;
  const { values, asOwner } = walked;
  const jobId = values.get('--job');
  const recordId = values.get('--record-id');
  if ((jobId === undefined) === (recordId === undefined)) {
    return { ok: false, error: `pass exactly one of --job or --record-id. ${USAGE}` };
  }
  const sourcePath = values.get('--source');
  const ledgerPath = values.get('--ledger');
  const signingKeyPath = values.get('--signing-key');
  return {
    ok: true,
    selector: jobId !== undefined ? { jobId } : { recordId: recordId as string },
    ...(sourcePath !== undefined ? { sourcePath } : {}),
    ...(ledgerPath !== undefined ? { ledgerPath } : {}),
    ...(signingKeyPath !== undefined ? { signingKeyPath } : {}),
    asOwner,
  };
}
