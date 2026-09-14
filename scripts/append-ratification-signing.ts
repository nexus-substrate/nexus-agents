/**
 * The signing half of the caller-commits append (#3927 item 4, phase 2).
 *
 * `append-ratification-record.ts` copies a record into the committed ledger;
 * this module signs the COMMITTED copy's hash — after re-sequencing and
 * re-hashing, never before — when a key is configured, resolves that
 * configuration from the CLI flag or `NEXUS_VOTE_SIGNING_KEY`, and words the
 * one-line notice the script prints either way. The private key is only ever
 * named by path to ssh-keygen; its bytes never enter this process or its
 * output, and the notice names the signer's principal, never the key.
 *
 * @module scripts/append-ratification-signing
 * (Source: Issue #3927 item 4)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  ALLOWED_SIGNERS_FILE,
  signVoteRecordHash,
} from '../packages/nexus-agents/src/audit/vote-record-signature.js';

/** The env var naming the signing key when `--signing-key` is not passed. */
export const VOTE_SIGNING_KEY_ENV = 'NEXUS_VOTE_SIGNING_KEY';

/** How the append signs: the key (by path) and the file the signature must verify against. */
export interface SigningOptions {
  /** Private key path, or its `.pub` when the private half is in ssh-agent. Named to ssh-keygen, never read here. */
  readonly keyPath: string;
  /** The allowed_signers the signature is verified against; it also supplies the signer's `keyId`. */
  readonly allowedSignersPath: string;
}

/** Whether the committed record was signed, and why not when it was not. */
export type SigningState = 'signed' | 'unsigned-no-key';

export type SignStep =
  | { readonly ok: true; readonly record: VoteRecord; readonly signing: SigningState }
  /** `detail` is the `signing-failed` refusal text; nothing has been written. */
  | { readonly ok: false; readonly detail: string };

/**
 * Sign the COMMITTED record's hash — the one `relink` just computed — when a
 * key is configured. Every failure is a refusal before any write: an
 * allowed_signers that cannot be read, a key ssh-keygen cannot use, a key the
 * file does not list (a signature no gate could verify is a defect at the
 * moment of signing, not later).
 */
export function signCommitted(record: VoteRecord, signing: SigningOptions | undefined): SignStep {
  if (signing === undefined) return { ok: true, record, signing: 'unsigned-no-key' };
  let allowedSigners: string;
  try {
    allowedSigners = readFileSync(signing.allowedSignersPath, 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      detail:
        `allowed_signers at ${signing.allowedSignersPath} could not be read (${message}); ` +
        'a signature that cannot be verified against the committed file is not written.',
    };
  }
  const signed = signVoteRecordHash({
    hash: record.hash,
    keyPath: signing.keyPath,
    allowedSigners,
  });
  if (!signed.ok) {
    return {
      ok: false,
      detail:
        `could not sign record '${record.id}' with the configured key: ${signed.reason}. ` +
        'Nothing was written; fix the key or omit --signing-key to append unsigned.',
    };
  }
  return { ok: true, record: { ...record, signature: signed.signature }, signing: 'signed' };
}

/**
 * `--signing-key`, else `NEXUS_VOTE_SIGNING_KEY`, else unsigned. An empty
 * env value is "not configured", not a key at path ''. The allowed_signers
 * is the one beside the ledger being appended to.
 */
export function resolveSigning(
  flagKeyPath: string | undefined,
  env: NodeJS.ProcessEnv,
  ledgerPath: string
): SigningOptions | undefined {
  const keyPath = flagKeyPath ?? (env[VOTE_SIGNING_KEY_ENV] ?? '').trim();
  if (keyPath === '') return undefined;
  return { keyPath, allowedSignersPath: join(dirname(ledgerPath), ALLOWED_SIGNERS_FILE) };
}

/**
 * The one line the CLI prints after an append: the signer by principal
 * (never the key), or the fact that no key was configured and how to
 * configure one.
 */
export function signingNotice(signing: SigningState, record: VoteRecord): string {
  if (signing === 'signed') {
    return (
      `[append-ratification-record] signed by ${record.signature?.keyId ?? '(unknown)'} ` +
      `(ssh-keygen -Y sign, namespace ${record.signature?.namespace ?? '?'}).`
    );
  }
  return (
    '[append-ratification-record] appended UNSIGNED: no signing key configured ' +
    `(pass --signing-key <path> or set ${VOTE_SIGNING_KEY_ENV}); the gate reports ` +
    'unsigned-record informationally until the #3927 phase-3 cutover.'
  );
}
