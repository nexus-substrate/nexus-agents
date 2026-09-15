/**
 * Tests for the vote-record signature verifier (#3927 item 4, phases 1-2).
 *
 * Real `ssh-keygen` throughout: every test generates ephemeral ed25519 keys in
 * a temp dir (nothing here is a committed secret — the keys exist for one
 * run and are deleted with the dir) and writes an `allowed_signers` with
 * `valid-after` / `valid-before` windows. Every verdict code is produced by a
 * real invocation, so a collapse between two codes fails a test that names
 * the code it expected. The one injected runner is for the code that cannot
 * be reached by a real key: `signature-not-measured` when `ssh-keygen` itself
 * is missing.
 *
 * @module audit/vote-record-signature.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VoteRecord, VoteRecordSignature } from './vote-record.js';
import {
  VOTE_RECORD_SIGNATURE_NAMESPACE,
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from './vote-record.js';
import type {
  SshKeygenInvocation,
  SshKeygenRunner,
  VoteRecordSignatureVerdict,
} from './vote-record-signature.js';
import {
  AGENT_PRINCIPAL_PREFIX,
  runSshKeygen,
  signVoteRecordHash,
  signerKindOf,
  sshKeygenVerifyTime,
  verifyVoteRecordSignature,
} from './vote-record-signature.js';

// ---------------------------------------------------------------------------
// Fixtures: ephemeral keys, a windowed allowed_signers, one unsigned record.
// ---------------------------------------------------------------------------

const OPERATOR = 'alice@test';
/** The dedicated agent identity (#6257 increment 1): the `nexus-agent@` prefix is what makes it `agent`. */
const AGENT = `${AGENT_PRINCIPAL_PREFIX}framework.test`;
const EXPIRED = 'expired@test';
const FUTURE = 'future@test';
/** Rotated out: window closed years ago, but open at the time the OLD record was made. */
const ROTATED = 'rotated@test';
/** Onboarded recently: valid now, but not yet at the time the OLD record was made. */
const ONBOARDED = 'onboarded@test';
/** A `recordedAt` inside ROTATED's window and before ONBOARDED's — long before the wall clock. */
const OLD_RECORDED_AT = '2020-06-01T00:00:00.000Z';

let dir: string;
/** Listed as OPERATOR, inside its validity window, restricted to the namespace. */
let operatorKey: string;
/** Listed as AGENT, inside its window, restricted to the namespace — the autonomous loop's key. */
let agentKey: string;
/** Listed twice, as EXPIRED (window ended) and FUTURE (window not begun). */
let windowedKey: string;
/** Listed nowhere. */
let strangerKey: string;
/** Listed as ROTATED (valid 2020-01-01 .. 2021-01-01) — the rotation case. */
let rotatedKey: string;
/** Listed as ONBOARDED (valid from 2025-01-01) — the late-onboarding case. */
let onboardedKey: string;
let allowedSigners: string;

function keygen(path: string, comment: string): void {
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', comment, '-f', path], {
    stdio: 'ignore',
  });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vote-record-signature-'));
  operatorKey = join(dir, 'operator');
  agentKey = join(dir, 'agent');
  windowedKey = join(dir, 'windowed');
  strangerKey = join(dir, 'stranger');
  rotatedKey = join(dir, 'rotated');
  onboardedKey = join(dir, 'onboarded');
  keygen(operatorKey, 'ephemeral test key — operator');
  keygen(agentKey, 'ephemeral test key — agent');
  keygen(windowedKey, 'ephemeral test key — windowed');
  keygen(strangerKey, 'ephemeral test key — stranger');
  keygen(rotatedKey, 'ephemeral test key — rotated');
  keygen(onboardedKey, 'ephemeral test key — onboarded');
  const pub = (p: string): string => readFileSync(`${p}.pub`, 'utf-8').trim();
  // Options are ONE comma-joined token (sshd's authorized_keys form); written
  // space-separated, ssh-keygen reports the line as `invalid key` and the
  // operator becomes an unknown signer — measured while writing this fixture.
  allowedSigners = [
    '# ephemeral allowed_signers for vote-record-signature.test.ts',
    `${OPERATOR} namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="20200101",valid-before="20991231" ${pub(operatorKey)}`,
    `${AGENT} namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="20200101" ${pub(agentKey)}`,
    `${EXPIRED} valid-before="20200101" ${pub(windowedKey)}`,
    `${FUTURE} valid-after="20990101" ${pub(windowedKey)}`,
    `${ROTATED} valid-after="20200101",valid-before="20210101" ${pub(rotatedKey)}`,
    `${ONBOARDED} valid-after="20250101" ${pub(onboardedKey)}`,
    '',
  ].join('\n');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function unsignedRecord(
  id = 'vote-sig-1',
  sequence = 0,
  recordedAt = '2026-09-14T00:00:00.000Z'
): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.11',
    id,
    sequence,
    recordedAt,
    proposalHash: 'a'.repeat(64),
    proposal: 'Ratify PR #6200 at its head',
    strategy: 'supermajority',
    decision: 'approved',
    approvalPercentage: 100,
    voteCounts: { approve: 7, reject: 0, abstain: 0, total: 7 },
    voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    panelCoverage: { requested: 7, responded: 7, errored: 0, erroredRoles: [] },
    ratifiesPr: { pr: 6200, headSha: '0123456789abcdef0123456789abcdef01234567' },
    errorPolicy: 'absolute_quorum',
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/** Sign `message` with `keyPath` under `namespace`, raw — bypassing the module under test. */
function rawSign(message: string, keyPath: string, namespace: string): string {
  return execFileSync('ssh-keygen', ['-Y', 'sign', '-f', keyPath, '-n', namespace, '-'], {
    input: message,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore'],
  });
}

function signed(
  record: VoteRecord,
  keyPath: string,
  keyId: string,
  namespace?: string
): VoteRecord {
  const sig = rawSign(record.hash, keyPath, namespace ?? VOTE_RECORD_SIGNATURE_NAMESPACE);
  const signature: VoteRecordSignature = {
    keyId,
    namespace: VOTE_RECORD_SIGNATURE_NAMESPACE,
    sig,
  };
  return { ...record, signature };
}

function verdictOf(record: VoteRecord, runner?: SshKeygenRunner): VoteRecordSignatureVerdict {
  return verifyVoteRecordSignature({ record, allowedSigners }, runner);
}

/** A runner that records every invocation and delegates to the real one. */
function recordingRunner(): { runner: SshKeygenRunner; seen: SshKeygenInvocation[] } {
  const seen: SshKeygenInvocation[] = [];
  const runner: SshKeygenRunner = (invocation) => {
    seen.push(invocation);
    return runSshKeygen(invocation);
  };
  return { runner, seen };
}

// ---------------------------------------------------------------------------
// The five codes, each from a real invocation.
// ---------------------------------------------------------------------------

describe('verifyVoteRecordSignature — every code is distinct and reachable', () => {
  it('the fixtures are what they claim: the unsigned record self-verifies and carries no signature', () => {
    const r = unsignedRecord();
    expect(r.signature).toBeUndefined();
    expect(verifyVoteRecordSet([r]).ok).toBe(true);
  });

  it('unsigned-record: a record with no `signature` field', () => {
    expect(verdictOf(unsignedRecord())).toEqual({ code: 'unsigned-record' });
  });

  it('signed: the operator key, inside its window, over the committed hash, in the namespace — kind `owner`', () => {
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    expect(verdictOf(r)).toEqual({
      code: 'signed',
      keyId: OPERATOR,
      principal: OPERATOR,
      signerKind: 'owner',
    });
  });

  it('signed: the AGENT key under its `nexus-agent@` principal — kind `agent`, never a bare boolean (#6257)', () => {
    const r = signed(unsignedRecord(), agentKey, AGENT);
    expect(verdictOf(r)).toEqual({
      code: 'signed',
      keyId: AGENT,
      principal: AGENT,
      signerKind: 'agent',
    });
  });

  it('the two kinds are distinct over the same record: owner-signed and agent-signed do not collapse', () => {
    const owner = verdictOf(signed(unsignedRecord(), operatorKey, OPERATOR));
    const agent = verdictOf(signed(unsignedRecord(), agentKey, AGENT));
    if (owner.code !== 'signed' || agent.code !== 'signed') throw new Error('unreachable');
    expect(owner.signerKind).not.toBe(agent.signerKind);
    expect(new Set([owner.signerKind, agent.signerKind])).toEqual(new Set(['owner', 'agent']));
  });

  it("unknown-signer: the agent key signing under the OPERATOR's name — the file, not the claim, decides the kind", () => {
    // An automated append that CLAIMS the owner principal with the agent key
    // is not `signed` as owner: the key is listed for the agent principal.
    const v = verdictOf(signed(unsignedRecord(), agentKey, OPERATOR));
    expect(v.code).toBe('unknown-signer');
    if (v.code !== 'unknown-signer') throw new Error('unreachable');
    expect(v.reason).toContain(`'${AGENT}'`);
  });

  it('unknown-signer: an EMPTY allowed_signers — nobody is listed, so nothing reads as signed', () => {
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    for (const empty of ['', '\n', '# only a comment\n']) {
      const v = verifyVoteRecordSignature({ record: r, allowedSigners: empty });
      expect(v.code).toBe('unknown-signer');
      if (v.code !== 'unknown-signer') throw new Error('unreachable');
      expect(v.reason).toContain(`no allowed_signers entry names '${OPERATOR}'`);
    }
  });

  it('bad-signature: the agent key under its own principal but in another namespace', () => {
    const v = verdictOf(signed(unsignedRecord(), agentKey, AGENT, 'git'));
    expect(v.code).toBe('bad-signature');
    if (v.code !== 'bad-signature') throw new Error('unreachable');
    expect(v.keyId).toBe(AGENT);
  });

  it('unknown-signer: a key listed nowhere in allowed_signers, even under the operator identity', () => {
    // The stranger signs and CLAIMS to be the operator. Not `unsigned-record`
    // (there is a signature) and not `bad-signature` (it is a valid signature
    // by someone): the signer is unknown.
    const r = signed(unsignedRecord(), strangerKey, OPERATOR);
    const v = verdictOf(r);
    expect(v.code).toBe('unknown-signer');
    if (v.code !== 'unknown-signer') throw new Error('unreachable');
    expect(v.keyId).toBe(OPERATOR);
  });

  it('unknown-signer: a listed key OUTSIDE its validity window — expired, and not yet valid', () => {
    // `valid-before` in the past: ssh-keygen -Y find-principals names the
    // window in its refusal, and the verdict carries that text.
    const expired = verdictOf(signed(unsignedRecord(), windowedKey, EXPIRED));
    expect(expired.code).toBe('unknown-signer');
    if (expired.code !== 'unknown-signer') throw new Error('unreachable');
    expect(expired.reason).toContain('expired');

    const future = verdictOf(signed(unsignedRecord(), windowedKey, FUTURE));
    expect(future.code).toBe('unknown-signer');
    if (future.code !== 'unknown-signer') throw new Error('unreachable');
    expect(future.reason).toContain('not yet valid');
  });

  it('unknown-signer: the record names an identity allowed_signers has no entry for', () => {
    const r = signed(unsignedRecord(), operatorKey, 'nobody@test');
    const v = verdictOf(r);
    expect(v.code).toBe('unknown-signer');
    if (v.code !== 'unknown-signer') throw new Error('unreachable');
    expect(v.reason).toContain("no allowed_signers entry names 'nobody@test'");
  });

  it("unknown-signer: a listed key signing under ANOTHER listed principal's name", () => {
    // The operator's key is real and in-window, but the record claims the
    // signature belongs to `expired@test`. find-principals resolves the key to
    // `alice@test`; the claimed identity is not among them.
    const r = signed(unsignedRecord(), operatorKey, EXPIRED);
    const v = verdictOf(r);
    expect(v.code).toBe('unknown-signer');
    if (v.code !== 'unknown-signer') throw new Error('unreachable');
    expect(v.reason).toContain(OPERATOR);
  });

  it('bad-signature: a signature made under another namespace (a replayed git signature)', () => {
    const r = signed(unsignedRecord(), operatorKey, OPERATOR, 'git');
    const v = verdictOf(r);
    expect(v.code).toBe('bad-signature');
    if (v.code !== 'bad-signature') throw new Error('unreachable');
    expect(v.reason).toContain('namespace');
  });

  it('bad-signature: a hashed field edited and re-hashed — the signature was over the old hash', () => {
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    const { hash: _stale, ...payload } = r;
    const flipped = { ...payload, decision: 'rejected' as const };
    const rehashed: VoteRecord = { ...flipped, hash: computeVoteRecordHash(flipped) };
    // The set verifier is satisfied (the edit was re-hashed)…
    expect(verifyVoteRecordSet([rehashed]).ok).toBe(true);
    // …and the signature is what catches it.
    const v = verdictOf(rehashed);
    expect(v.code).toBe('bad-signature');
    if (v.code !== 'bad-signature') throw new Error('unreachable');
    expect(v.reason).toContain('incorrect signature');
  });

  it('a hashed field edited WITHOUT re-hashing: the set verifier refuses; the signature over the stale hash still holds', () => {
    // The two verifiers answer different questions, and the gate must show
    // both: `signed` here does not mean the record is intact.
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    const edited: VoteRecord = { ...r, decision: 'rejected' };
    expect(verifyVoteRecordSet([edited]).ok).toBe(false);
    expect(verdictOf(edited)).toEqual({
      code: 'signed',
      keyId: OPERATOR,
      principal: OPERATOR,
      signerKind: 'owner',
    });
  });

  it('bad-signature: `sig` is not an armored SSH signature block — no ssh-keygen call is made', () => {
    const { runner, seen } = recordingRunner();
    const r: VoteRecord = {
      ...unsignedRecord(),
      signature: { keyId: OPERATOR, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig: 'garbage' },
    };
    const v = verdictOf(r, runner);
    expect(v.code).toBe('bad-signature');
    if (v.code !== 'bad-signature') throw new Error('unreachable');
    expect(v.reason).toContain('armored');
    expect(seen).toEqual([]);
  });

  it('signature-not-measured: ssh-keygen cannot be run (injected runner reports unavailable)', () => {
    const unavailable: SshKeygenRunner = () => ({
      kind: 'unavailable',
      reason: 'spawn ssh-keygen ENOENT',
    });
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    expect(verdictOf(r, unavailable)).toEqual({
      code: 'signature-not-measured',
      reason: 'spawn ssh-keygen ENOENT',
    });
  });

  it('signature-not-measured: the REAL runner with no ssh-keygen on PATH', () => {
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    const savedPath = process.env['PATH'];
    process.env['PATH'] = join(dir, 'no-binaries-here');
    try {
      const v = verdictOf(r);
      expect(v.code).toBe('signature-not-measured');
      if (v.code !== 'signature-not-measured') throw new Error('unreachable');
      expect(v.reason).toContain('ENOENT');
    } finally {
      process.env['PATH'] = savedPath;
    }
  });

  it('the five codes are pairwise distinct over the fixtures — none collapses into another', () => {
    const codes = [
      verdictOf(unsignedRecord()).code,
      verdictOf(signed(unsignedRecord(), operatorKey, OPERATOR)).code,
      verdictOf(signed(unsignedRecord(), strangerKey, OPERATOR)).code,
      verdictOf(signed(unsignedRecord(), operatorKey, OPERATOR, 'git')).code,
      verdictOf(signed(unsignedRecord(), operatorKey, OPERATOR), () => ({
        kind: 'unavailable',
        reason: 'x',
      })).code,
    ];
    expect(new Set(codes).size).toBe(5);
    expect(codes).toEqual([
      'unsigned-record',
      'signed',
      'unknown-signer',
      'bad-signature',
      'signature-not-measured',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The signed message is the hash STRING — the contrarian's canonicalisation point.
// ---------------------------------------------------------------------------

describe('the signed message is the committed `hash` string, never re-serialised JSON', () => {
  it('ssh-keygen -Y verify receives exactly `record.hash` on stdin', () => {
    const { runner, seen } = recordingRunner();
    const r = signed(unsignedRecord(), operatorKey, OPERATOR);
    expect(verdictOf(r, runner).code).toBe('signed');
    const verify = seen.find((i) => i.op === 'verify');
    expect(verify).toBeDefined();
    if (verify?.op !== 'verify') throw new Error('unreachable');
    expect(verify.message).toBe(r.hash);
    expect(verify.message).toMatch(/^[0-9a-f]{64}$/);
    expect(verify.message).not.toContain('{');
    expect(verify.identity).toBe(OPERATOR);
    expect(verify.namespace).toBe(VOTE_RECORD_SIGNATURE_NAMESPACE);
  });

  it('a signature over the re-serialised record JSON is bad-signature, even from the operator key', () => {
    // Exactly the failure the re-vote's contrarian described: two runtimes
    // serialising the same record differently. Signing the hash makes the
    // serialisation irrelevant — and a signature that WAS made over JSON does
    // not verify against the hash.
    const r = unsignedRecord();
    const overJson = rawSign(JSON.stringify(r), operatorKey, VOTE_RECORD_SIGNATURE_NAMESPACE);
    const forged: VoteRecord = {
      ...r,
      signature: { keyId: OPERATOR, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig: overJson },
    };
    expect(verdictOf(forged).code).toBe('bad-signature');
  });

  it('a signature over the hash with a trailing newline is bad-signature — the message is the bare hex', () => {
    const r = unsignedRecord();
    const withNewline = rawSign(`${r.hash}\n`, operatorKey, VOTE_RECORD_SIGNATURE_NAMESPACE);
    const forged: VoteRecord = {
      ...r,
      signature: { keyId: OPERATOR, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig: withNewline },
    };
    expect(verdictOf(forged).code).toBe('bad-signature');
  });
});

// ---------------------------------------------------------------------------
// Verification is anchored at the record's `recordedAt`, not the wall clock —
// otherwise rotating a key (adding `valid-before`) would turn every record it
// ever signed into `unknown-signer` (PR #6275 review).
// ---------------------------------------------------------------------------

describe('sshKeygenVerifyTime — recordedAt in the form `-Overify-time` accepts', () => {
  it('renders an ISO-8601 UTC instant as YYYYMMDDHHMMSSZ', () => {
    expect(sshKeygenVerifyTime('2026-09-14T13:05:09.123Z')).toEqual({
      ok: true,
      verifyTime: '20260914130509Z',
    });
  });

  it('normalises an offset timestamp to UTC — the Z suffix is what keeps ssh-keygen off the local zone', () => {
    expect(sshKeygenVerifyTime('2026-09-14T09:05:09-04:00')).toEqual({
      ok: true,
      verifyTime: '20260914130509Z',
    });
  });

  it('refuses a recordedAt that is not a timestamp, naming it', () => {
    for (const bad of ['', 'yesterday', '2026-13-45T00:00:00Z']) {
      const out = sshKeygenVerifyTime(bad);
      expect(out.ok).toBe(false);
      if (out.ok) throw new Error('unreachable');
      expect(out.reason).toContain(`'${bad}'`);
    }
  });
});

describe('verification is anchored at recordedAt: key rotation keeps old records verifiable', () => {
  it('signed: a ROTATED key whose valid-before predates now but postdates the record', () => {
    // The old record was made in 2020, inside the rotated key's window. The
    // key has since been rotated out (valid-before 2021). At wall-clock time
    // ssh-keygen would refuse it as expired; anchored at recordedAt it holds.
    const r = signed(unsignedRecord('vote-sig-old', 0, OLD_RECORDED_AT), rotatedKey, ROTATED);
    expect(verdictOf(r)).toEqual({
      code: 'signed',
      keyId: ROTATED,
      principal: ROTATED,
      signerKind: 'owner',
    });
  });

  it('unknown-signer: a key whose valid-after is AFTER the record — valid now, not when the record was made', () => {
    // A key onboarded in 2025 cannot have signed a 2020 record. At wall-clock
    // time it is in window and the forgery would read `signed`.
    const r = signed(unsignedRecord('vote-sig-old', 0, OLD_RECORDED_AT), onboardedKey, ONBOARDED);
    const v = verdictOf(r);
    expect(v.code).toBe('unknown-signer');
    if (v.code !== 'unknown-signer') throw new Error('unreachable');
    expect(v.reason).toContain('not yet valid');
  });

  it('both ssh-keygen calls carry the verify time derived from recordedAt', () => {
    const { runner, seen } = recordingRunner();
    const r = signed(unsignedRecord('vote-sig-old', 0, OLD_RECORDED_AT), rotatedKey, ROTATED);
    expect(verdictOf(r, runner).code).toBe('signed');
    const times = seen.map((i) => (i.op === 'sign' ? 'sign' : i.verifyTime));
    expect(times).toEqual(['20200601000000Z', '20200601000000Z']);
  });

  it('signature-not-measured: a recordedAt no verify time can be derived from — never a wall-clock fallback', () => {
    const { runner, seen } = recordingRunner();
    const r = signed(
      unsignedRecord('vote-sig-bad-ts', 0, 'not-a-timestamp'),
      operatorKey,
      OPERATOR
    );
    const v = verdictOf(r, runner);
    expect(v.code).toBe('signature-not-measured');
    if (v.code !== 'signature-not-measured') throw new Error('unreachable');
    expect(v.reason).toContain("'not-a-timestamp'");
    expect(seen).toEqual([]);
  });

  it('the signer anchors at recordedAt too: a key not yet valid at recordedAt is refused, so the gate never sees it', () => {
    const out = signVoteRecordHash({
      hash: unsignedRecord('vote-sig-old', 0, OLD_RECORDED_AT).hash,
      recordedAt: OLD_RECORDED_AT,
      keyPath: onboardedKey,
      allowedSigners,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.reason).toContain('not yet valid');
  });
});

// ---------------------------------------------------------------------------
// signVoteRecordHash — the append script's half of the round trip.
// ---------------------------------------------------------------------------

describe('signVoteRecordHash', () => {
  it('signs the hash string; `keyId` is the principal allowed_signers lists the key under; the result verifies as `signed`', () => {
    const r = unsignedRecord();
    const out = signVoteRecordHash({
      hash: r.hash,
      recordedAt: r.recordedAt,
      keyPath: operatorKey,
      allowedSigners,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    // The caller never supplied the name: the file did.
    expect(out.signature.keyId).toBe(OPERATOR);
    expect(out.signature.namespace).toBe(VOTE_RECORD_SIGNATURE_NAMESPACE);
    expect(out.signature.sig.startsWith('-----BEGIN SSH SIGNATURE-----')).toBe(true);
    expect(verdictOf({ ...r, signature: out.signature })).toEqual({
      code: 'signed',
      keyId: OPERATOR,
      principal: OPERATOR,
      signerKind: 'owner',
    });
  });

  it('signing with the agent key names the agent principal, and the verifier reports kind `agent`', () => {
    const r = unsignedRecord();
    const out = signVoteRecordHash({
      hash: r.hash,
      recordedAt: r.recordedAt,
      keyPath: agentKey,
      allowedSigners,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.signature.keyId).toBe(AGENT);
    const v = verdictOf({ ...r, signature: out.signature });
    expect(v.code).toBe('signed');
    if (v.code !== 'signed') throw new Error('unreachable');
    expect(v.signerKind).toBe('agent');
  });

  it('passes the bare hash as the message to ssh-keygen -Y sign', () => {
    const { runner, seen } = recordingRunner();
    const r = unsignedRecord();
    const out = signVoteRecordHash(
      { hash: r.hash, recordedAt: r.recordedAt, keyPath: operatorKey, allowedSigners },
      runner
    );
    expect(out.ok).toBe(true);
    const sign = seen[0];
    if (sign?.op !== 'sign') throw new Error('unreachable');
    expect(sign.message).toBe(r.hash);
    expect(sign.namespace).toBe(VOTE_RECORD_SIGNATURE_NAMESPACE);
    expect(sign.keyPath).toBe(operatorKey);
    expect(seen.map((i) => i.op)).toEqual(['sign', 'find-principals']);
  });

  it('a key that cannot be read is a named failure, not a throw and not an empty signature', () => {
    const out = signVoteRecordHash({
      hash: unsignedRecord().hash,
      recordedAt: unsignedRecord().recordedAt,
      keyPath: join(dir, 'no-such-key'),
      allowedSigners,
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error('unreachable');
    expect(out.reason).toContain('ssh-keygen -Y sign');
  });

  it('a key allowed_signers does not list (or lists only outside its window) is REFUSED, not signed as nobody', () => {
    const stranger = signVoteRecordHash({
      hash: unsignedRecord().hash,
      recordedAt: unsignedRecord().recordedAt,
      keyPath: strangerKey,
      allowedSigners,
    });
    expect(stranger.ok).toBe(false);
    if (stranger.ok) throw new Error('unreachable');
    expect(stranger.reason).toContain('not an allowed signer');

    const expired = signVoteRecordHash({
      hash: unsignedRecord().hash,
      recordedAt: unsignedRecord().recordedAt,
      keyPath: windowedKey,
      allowedSigners,
    });
    expect(expired.ok).toBe(false);
    if (expired.ok) throw new Error('unreachable');
    expect(expired.reason).toContain('expired');
  });

  it('an unavailable ssh-keygen is a named failure', () => {
    const out = signVoteRecordHash(
      {
        hash: unsignedRecord().hash,
        recordedAt: unsignedRecord().recordedAt,
        keyPath: operatorKey,
        allowedSigners,
      },
      () => ({ kind: 'unavailable', reason: 'spawn ssh-keygen ENOENT' })
    );
    expect(out).toEqual({ ok: false, reason: 'spawn ssh-keygen ENOENT' });
  });
});

// ---------------------------------------------------------------------------
// signerKindOf — the principal prefix is the whole rule (#6257 increment 1).
// ---------------------------------------------------------------------------

describe('signerKindOf', () => {
  it('`nexus-agent@<host>` is agent; the operator principal and anything else is owner', () => {
    expect(signerKindOf('nexus-agent@framework')).toBe('agent');
    expect(signerKindOf(AGENT)).toBe('agent');
    expect(signerKindOf('williamzujkowski@nexus-agents')).toBe('owner');
    expect(signerKindOf(OPERATOR)).toBe('owner');
  });

  it('the prefix must be at the START and exact: a suffix, a substring or a case change is not the agent', () => {
    expect(signerKindOf('alice@nexus-agent@host')).toBe('owner');
    expect(signerKindOf('x-nexus-agent@host')).toBe('owner');
    expect(signerKindOf('NEXUS-AGENT@host')).toBe('owner');
    expect(signerKindOf('nexus-agent')).toBe('owner');
  });

  it('the bare prefix with no host is still agent — the kind is about the prefix, not the host', () => {
    expect(signerKindOf(AGENT_PRINCIPAL_PREFIX)).toBe('agent');
  });
});
