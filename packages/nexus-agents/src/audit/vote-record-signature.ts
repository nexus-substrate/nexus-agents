/**
 * nexus-agents/audit - Vote-record signature: sign and verify (#3927 item 4).
 *
 * A vote record's `signature` is a detached `ssh-keygen -Y sign` signature,
 * namespace {@link VOTE_RECORD_SIGNATURE_NAMESPACE}, over the record's
 * committed `hash` string. This module is the one place that makes one
 * (`signVoteRecordHash`, the append script's half) and the one place that
 * checks one (`verifyVoteRecordSignature`, the gate's half), both through an
 * injectable `ssh-keygen` runner so the verdict ladder is testable without a
 * real binary and the real binary is exercised by ephemeral keys in tests.
 *
 * ## Why ssh-keygen, why the hash, why outside the hash
 *
 * The #3927 re-vote (option B, 5 of 6) chose SSH signatures over git commit
 * signatures because a squash merge discards the branch commit's signature —
 * a record's provenance has to travel WITH the record, not with the commit
 * that carried it. `ssh-keygen -Y` gives a committed `allowed_signers` file
 * with native `valid-after` / `valid-before` windows (rotation without code),
 * namespaced signatures (a git or file signature cannot be replayed as a
 * ratification), and offline verification with no GitHub dependency.
 *
 * The signed message is the record's `hash` — 64 lowercase hex characters,
 * no newline — never a re-serialised form of the record. The re-vote's
 * contrarian objected that JSON canonicalisation is brittle across runtimes;
 * signing the hash makes that moot: one TypeScript projection already
 * produces the hash and every gate consumes it, and a verifier in any
 * language checks the signature over that string. Because the hash covers
 * `sequence`, the chain position is signed too. And because the signature is
 * made over the hash, it cannot be inside it — it is the second hash-excluded
 * record field after `previousHash`.
 *
 * ## The verdict ladder — five codes, never collapsed
 *
 * | Code | Meaning |
 * | --- | --- |
 * | `signed` | a key listed for `keyId`, inside its window, made this signature over this hash in this namespace |
 * | `unsigned-record` | the record carries no `signature` — every pre-phase-2 record, and any appended with no key configured |
 * | `unknown-signer` | there IS a signature, but the signing key is not one `allowed_signers` lists for `keyId` right now: not listed at all, listed under another principal, outside its window, or `keyId` itself has no entry |
 * | `bad-signature` | the key is the right one and the signature does not hold: made over a different message (an edited-and-re-hashed record, re-serialised JSON), under another namespace, or not an armored block at all |
 * | `signature-not-measured` | the verifier could not run: `ssh-keygen` missing or killed. The caller maps an unreadable `allowed_signers` here too |
 *
 * `unknown-signer` and `bad-signature` are told apart by `ssh-keygen -Y
 * find-principals`, which resolves a signature's key to the principals the
 * file lists for it at verify time (windows honoured); only when `keyId` is
 * among them does `-Y verify` run. A refusal at either step keeps ssh-keygen's
 * own reason text (`key has expired: …`, `namespace does not match`,
 * `incorrect signature`) so the gate line says why.
 *
 * ## What `signed` proves
 *
 * Access to the private key from the environment that ran the append — not a
 * human's presence. Measured on 2026-09-14: the agent process signed ledger
 * commit `4a5acd562f` with the operator's cached GPG key and no prompt. A
 * signature made that way is a stronger hash, not a ratification; custody
 * (a hardware-backed key, or a CI/OIDC identity for machine-made records) is
 * #6257. The threat model states the same.
 *
 * Consumers live in `scripts/` — `append-ratification-record.ts` signs,
 * `governor-ledger-evidence.ts` verifies — which the producer/consumer gate's
 * walk of `packages/nexus-agents/src` cannot see; the marker below names them.
 *
 * @module audit/vote-record-signature
 */

// @export-no-consumer-yet — see #3927 (consumed by scripts/append-ratification-record.ts
// and scripts/governor-ledger-evidence.ts, outside the gate's source walk)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VoteRecord, VoteRecordSignature } from './vote-record.js';
import { VOTE_RECORD_SIGNATURE_NAMESPACE } from './vote-record.js';

/**
 * The allowed_signers file's name, beside the ledger it vouches for
 * (`governance/allowed_signers` for the committed one). One definition for
 * the append script (which signs against it) and the gate (which verifies
 * against it), on the `VOTE_RECORDS_REL_PATH` rule.
 */
export const ALLOWED_SIGNERS_FILE = 'allowed_signers';

/**
 * One `ssh-keygen -Y` call, described by what it needs rather than by argv,
 * so a test can assert the MESSAGE that reached the binary (the hash string,
 * never JSON) and a caller can substitute the binary.
 */
export type SshKeygenInvocation =
  | {
      readonly op: 'find-principals';
      /** The allowed_signers file CONTENT. */
      readonly allowedSigners: string;
      /** The armored signature block. */
      readonly signature: string;
    }
  | {
      readonly op: 'verify';
      readonly allowedSigners: string;
      readonly signature: string;
      readonly identity: string;
      readonly namespace: string;
      /** Goes to stdin, byte-exact. */
      readonly message: string;
    }
  | {
      readonly op: 'sign';
      /** Private key path, or a `.pub` when the private half is in the agent. */
      readonly keyPath: string;
      readonly namespace: string;
      readonly message: string;
    };

export type SshKeygenOutcome =
  | {
      readonly kind: 'ran';
      readonly status: number;
      readonly stdout: string;
      readonly stderr: string;
    }
  /** The binary could not be started or did not exit normally — nothing was measured. */
  | { readonly kind: 'unavailable'; readonly reason: string };

export type SshKeygenRunner = (invocation: SshKeygenInvocation) => SshKeygenOutcome;

/** The argv for an invocation, given the paths its file inputs were written to. */
function argvFor(
  invocation: SshKeygenInvocation,
  files: { readonly allowedSigners: string; readonly signature: string }
): string[] {
  switch (invocation.op) {
    case 'find-principals':
      return ['-Y', 'find-principals', '-f', files.allowedSigners, '-s', files.signature];
    case 'verify':
      return [
        '-Y',
        'verify',
        '-f',
        files.allowedSigners,
        '-I',
        invocation.identity,
        '-n',
        invocation.namespace,
        '-s',
        files.signature,
      ];
    case 'sign':
      // `-` signs stdin and writes the armored signature to stdout: the
      // message never touches disk and no `<file>.sig` is left behind.
      return ['-Y', 'sign', '-f', invocation.keyPath, '-n', invocation.namespace, '-'];
  }
}

/**
 * The default runner: materialise the file inputs in a private temp dir
 * (`mkdtemp` is mode 0700), spawn `ssh-keygen` with the message on stdin,
 * remove the dir. The private key is only ever named by path; its bytes are
 * never read by this module.
 */
export function runSshKeygen(invocation: SshKeygenInvocation): SshKeygenOutcome {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-vote-sig-'));
  try {
    const files = {
      allowedSigners: join(dir, 'allowed_signers'),
      signature: join(dir, 'record.sig'),
    };
    if (invocation.op !== 'sign') {
      writeFileSync(files.allowedSigners, invocation.allowedSigners, {
        encoding: 'utf-8',
        mode: 0o600,
      });
      writeFileSync(files.signature, invocation.signature, { encoding: 'utf-8', mode: 0o600 });
    }
    const input = invocation.op === 'find-principals' ? '' : invocation.message;
    const result = spawnSync('ssh-keygen', argvFor(invocation, files), {
      input,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error !== undefined) {
      return {
        kind: 'unavailable',
        reason: `spawn ssh-keygen ${describeSpawnError(result.error)}`,
      };
    }
    if (result.status === null) {
      return {
        kind: 'unavailable',
        reason: `ssh-keygen terminated by signal ${result.signal ?? 'unknown'}`,
      };
    }
    return { kind: 'ran', status: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `ENOENT` (the case that matters) or the error's message. */
function describeSpawnError(error: NodeJS.ErrnoException): string {
  return error.code ?? error.message;
}

/**
 * The verifier's answer for one record. See the module header's table. Each
 * refusal carries the identity it was computed for and ssh-keygen's own
 * reason where there is one; `signature-not-measured` carries why nothing was
 * measured.
 */
export type VoteRecordSignatureVerdict =
  | { readonly code: 'signed'; readonly keyId: string }
  | { readonly code: 'unsigned-record' }
  | { readonly code: 'unknown-signer'; readonly keyId: string; readonly reason: string }
  | { readonly code: 'bad-signature'; readonly keyId: string; readonly reason: string }
  | { readonly code: 'signature-not-measured'; readonly reason: string };

export interface VerifyVoteRecordSignatureInput {
  readonly record: VoteRecord;
  /** The `governance/allowed_signers` CONTENT — the caller reads the file and maps a read failure to `signature-not-measured`. */
  readonly allowedSigners: string;
}

/** The shape `ssh-keygen -Y sign` emits: header line, base64 body, footer line. */
const ARMORED_SIGNATURE =
  /^-----BEGIN SSH SIGNATURE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END SSH SIGNATURE-----\r?\n?$/;

/**
 * The principals an allowed_signers text names: the first token of every
 * non-blank, non-comment line, split on `,`. Only used to say WHICH way an
 * identity is unknown — ssh-keygen is still the authority on whether a key
 * is listed, in window, and permitted the namespace.
 */
function listedPrincipals(allowedSigners: string): Set<string> {
  const principals = new Set<string>();
  for (const raw of allowedSigners.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const first = line.split(/\s+/)[0] ?? '';
    for (const p of first.split(',')) if (p !== '') principals.add(p);
  }
  return principals;
}

/** ssh-keygen's stderr, one line, or a fallback naming the exit status. */
function reasonFrom(outcome: Extract<SshKeygenOutcome, { kind: 'ran' }>): string {
  const lines = outcome.stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return lines.length > 0 ? lines.join('; ') : `ssh-keygen exited ${String(outcome.status)}`;
}

type Principals =
  | { readonly kind: 'listed'; readonly principals: readonly string[] }
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

/**
 * Which principal(s) does a signature's KEY belong to, as of now? `ssh-keygen
 * -Y find-principals` honours the validity windows, so a key that is unlisted,
 * or listed only outside its window, resolves to `none` with ssh-keygen's
 * reason (`key has expired: …`). Shared by the verifier (is the claimed
 * identity among them?) and the signer (what identity should the record
 * claim?), so the two cannot disagree about what the file says.
 */
function principalsFor(
  allowedSigners: string,
  signature: string,
  runner: SshKeygenRunner
): Principals {
  const outcome = runner({ op: 'find-principals', allowedSigners, signature });
  if (outcome.kind === 'unavailable') return { kind: 'unavailable', reason: outcome.reason };
  if (outcome.status !== 0) return { kind: 'none', reason: reasonFrom(outcome) };
  const principals = outcome.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  // Exit 0 with no principal is not a shape ssh-keygen produces, but "listed
  // for nobody" must not read as "listed" if it ever does.
  if (principals.length === 0) {
    return { kind: 'none', reason: 'ssh-keygen -Y find-principals named no principal' };
  }
  return { kind: 'listed', principals };
}

/**
 * Verify a record's `signature` against an allowed_signers text. Pure over
 * its inputs apart from the injected runner (default: the real binary).
 * Never throws for a verdict the ladder can name; see the module header.
 */
export function verifyVoteRecordSignature(
  input: VerifyVoteRecordSignatureInput,
  runner: SshKeygenRunner = runSshKeygen
): VoteRecordSignatureVerdict {
  const { record, allowedSigners } = input;
  const signature = record.signature;
  if (signature === undefined) return { code: 'unsigned-record' };
  const keyId = signature.keyId;

  if (!ARMORED_SIGNATURE.test(signature.sig)) {
    return { code: 'bad-signature', keyId, reason: 'sig is not an armored SSH signature block' };
  }
  if (!listedPrincipals(allowedSigners).has(keyId)) {
    return { code: 'unknown-signer', keyId, reason: `no allowed_signers entry names '${keyId}'` };
  }

  const principals = principalsFor(allowedSigners, signature.sig, runner);
  if (principals.kind === 'unavailable') {
    return { code: 'signature-not-measured', reason: principals.reason };
  }
  if (principals.kind === 'none')
    return { code: 'unknown-signer', keyId, reason: principals.reason };
  if (!principals.principals.includes(keyId)) {
    return {
      code: 'unknown-signer',
      keyId,
      reason: `the signing key is listed for ${principals.principals.map((p) => `'${p}'`).join(', ')}, not for '${keyId}'`,
    };
  }

  // The right key. Does the signature hold over THIS hash, in THIS namespace?
  const verified = runner({
    op: 'verify',
    allowedSigners,
    signature: signature.sig,
    identity: keyId,
    namespace: VOTE_RECORD_SIGNATURE_NAMESPACE,
    message: record.hash,
  });
  if (verified.kind === 'unavailable') {
    return { code: 'signature-not-measured', reason: verified.reason };
  }
  if (verified.status !== 0) return { code: 'bad-signature', keyId, reason: reasonFrom(verified) };
  return { code: 'signed', keyId };
}

export interface SignVoteRecordHashInput {
  /** The COMMITTED hash — after re-sequencing, after re-hashing. Signing an earlier hash signs nothing the ledger carries. */
  readonly hash: string;
  /** Private key path (or its `.pub` when the private half is in ssh-agent). Named, never read, by this module. */
  readonly keyPath: string;
  /** The `governance/allowed_signers` CONTENT the signature will be verified against; it supplies `keyId`. */
  readonly allowedSigners: string;
}

/**
 * Sign a committed hash. Returns the `signature` object to place on the
 * record — its `keyId` is the principal `allowed_signers` lists the key
 * under, so the file, not the caller, names the signer — or a named failure:
 * a key that cannot be read, a passphrase prompt with no terminal, no
 * ssh-keygen, or a key the file does not list (a signature no gate could
 * verify is refused here rather than written and reported `unknown-signer`
 * later). Never an empty signature.
 */
export function signVoteRecordHash(
  input: SignVoteRecordHashInput,
  runner: SshKeygenRunner = runSshKeygen
):
  | { readonly ok: true; readonly signature: VoteRecordSignature }
  | { readonly ok: false; readonly reason: string } {
  const outcome = runner({
    op: 'sign',
    keyPath: input.keyPath,
    namespace: VOTE_RECORD_SIGNATURE_NAMESPACE,
    message: input.hash,
  });
  if (outcome.kind === 'unavailable') return { ok: false, reason: outcome.reason };
  if (outcome.status !== 0 || !ARMORED_SIGNATURE.test(outcome.stdout)) {
    return { ok: false, reason: `ssh-keygen -Y sign failed: ${reasonFrom(outcome)}` };
  }
  const principals = principalsFor(input.allowedSigners, outcome.stdout, runner);
  if (principals.kind === 'unavailable') return { ok: false, reason: principals.reason };
  if (principals.kind === 'none') {
    return {
      ok: false,
      reason: `the signing key is not an allowed signer (allowed_signers: ${principals.reason})`,
    };
  }
  // A key listed under several principals signs as the first listed; the
  // record must claim exactly one identity and the file's order is the
  // operator's.
  const keyId = principals.principals[0] as string;
  return {
    ok: true,
    signature: { keyId, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig: outcome.stdout },
  };
}
