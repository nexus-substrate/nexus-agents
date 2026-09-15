/** Arguments for the operator redaction tool (#6265); only --role repeats. */
export interface RedactArgs {
  readonly ok: true;
  readonly ledgerPath: string;
  readonly recordId: string;
  readonly roles: readonly string[];
  readonly by: string;
  readonly reason: string;
  /** Accepted for CLI parity; redaction signatures are not supported yet. */
  readonly signingKeyPath?: string;
  readonly asOwner: boolean;
}

const VALUE_FLAGS = ['--ledger', '--record-id', '--role', '--by', '--reason', '--signing-key'];
const REQUIRED_FLAGS = ['--ledger', '--record-id', '--by', '--reason'];
type ParsedArgs = RedactArgs | { readonly ok: false; readonly error: string };
type WalkedArgs =
  | {
      readonly ok: true;
      readonly values: Map<string, string>;
      readonly roles: string[];
      readonly asOwner: boolean;
    }
  | { readonly ok: false; readonly error: string };

/** Walk options; repeated scalar values would make the operator's intent ambiguous. */
function walkArgs(argv: readonly string[]): WalkedArgs {
  const values = new Map<string, string>();
  const roles: string[] = [];
  let asOwner = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (flag === '--as-owner' && !asOwner) {
      asOwner = true;
      continue;
    }
    if (!VALUE_FLAGS.includes(flag))
      return { ok: false, error: `unknown or repeated argument '${flag}'` };
    const value = argv[++i];
    if (value === undefined || value.trim() === '' || value.startsWith('--')) {
      return { ok: false, error: `${flag} needs a nonempty value` };
    }
    if (flag === '--role') roles.push(value);
    else {
      if (values.has(flag)) return { ok: false, error: `repeated argument '${flag}'` };
      values.set(flag, value);
    }
  }
  return { ok: true, values, roles, asOwner };
}

/** Refuse absent/empty values, unknown options, duplicate scalars, and zero roles. */
export function parseRedactArgs(argv: readonly string[]): ParsedArgs {
  const walked = walkArgs(argv);
  if (!walked.ok) return walked;
  const { values, roles, asOwner } = walked;
  const missing = REQUIRED_FLAGS.filter((flag) => !values.has(flag));
  if (missing.length > 0) return { ok: false, error: `required: ${missing.join(', ')}` };
  if (roles.length === 0)
    return { ok: false, error: 'at least one role is required (--role <voterRole>)' };
  const signingKeyPath = values.get('--signing-key');
  return {
    ok: true,
    ledgerPath: values.get('--ledger') as string,
    recordId: values.get('--record-id') as string,
    roles,
    by: values.get('--by') as string,
    reason: values.get('--reason') as string,
    asOwner,
    ...(signingKeyPath !== undefined ? { signingKeyPath } : {}),
  };
}
