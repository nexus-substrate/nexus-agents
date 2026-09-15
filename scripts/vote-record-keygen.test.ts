/**
 * Tests for the agent signing-key generator (#6257 increment 1).
 *
 * Real `ssh-keygen` over a temp dir — never `~/.ssh`, never the real
 * `<dataDir>/auth/`: every key here is generated into `mkdtemp` and deleted
 * with it. The load-bearing test is the round trip: the `allowed_signers`
 * line the script PRINTS, verified by the REAL verifier over a signature the
 * generated key made, yields `signed` with kind `agent`. A generator whose
 * printed entry did not verify would be a tool that ships a broken
 * governor-path edit.
 *
 * @module scripts/vote-record-keygen.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  VOTE_RECORD_SIGNATURE_NAMESPACE,
  computeVoteRecordHash,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  signVoteRecordHash,
  verifyVoteRecordSignature,
} from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import {
  allowedSignersEntry,
  defaultAgentPrincipal,
  generateAgentKey,
  keygenPlan,
  todayUtc,
  type KeygenPlan,
} from './vote-record-keygen.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'vote-record-keygen.ts');

const DEFAULTS = {
  keyPath: '/default/auth/vote-record-signing.key',
  principal: 'nexus-agent@default-host',
  validAfter: '20260915',
};

let dir: string;
let plan: KeygenPlan;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vote-record-keygen-'));
  plan = {
    keyPath: join(dir, 'auth', 'vote-record-signing.key'),
    principal: 'nexus-agent@fixture-host',
    validAfter: '20260101',
  };
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function record(): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.11',
    id: 'vote-keygen-1',
    sequence: 0,
    recordedAt: '2026-09-15T00:00:00.000Z',
    proposalHash: 'a'.repeat(64),
    proposal: 'Ratify PR #6257 at its head',
    strategy: 'supermajority',
    decision: 'approved',
    approvalPercentage: 100,
    voteCounts: { approve: 7, reject: 0, abstain: 0, total: 7 },
    voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    panelCoverage: { requested: 7, responded: 7, errored: 0, erroredRoles: [] },
    ratifiesPr: { pr: 6257, headSha: '0123456789abcdef0123456789abcdef01234567' },
    errorPolicy: 'absolute_quorum',
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

describe('generateAgentKey', () => {
  it('ROUND TRIP: the printed allowed_signers line verifies a signature by the generated key as signed / agent', () => {
    const out = generateAgentKey(plan);
    expect(out.kind).toBe('generated');
    if (out.kind !== 'generated') throw new Error('unreachable');

    const r = record();
    const signed = signVoteRecordHash({
      hash: r.hash,
      recordedAt: r.recordedAt,
      keyPath: out.keyPath,
      allowedSigners: `${out.allowedSignersLine}\n`,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) throw new Error('unreachable');
    expect(signed.signature.keyId).toBe(plan.principal);
    expect(
      verifyVoteRecordSignature({
        record: { ...r, signature: signed.signature },
        allowedSigners: `${out.allowedSignersLine}\n`,
      })
    ).toEqual({
      code: 'signed',
      keyId: plan.principal,
      principal: plan.principal,
      signerKind: 'agent',
    });
  });

  it('the line is namespace-bound: a signature by the key in another namespace is bad-signature', () => {
    const out = generateAgentKey(plan);
    if (out.kind !== 'generated') throw new Error(out.reason);
    const r = record();
    const sig = execFileSync('ssh-keygen', ['-Y', 'sign', '-f', out.keyPath, '-n', 'git', '-'], {
      input: r.hash,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const v = verifyVoteRecordSignature({
      record: {
        ...r,
        signature: { keyId: plan.principal, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig },
      },
      allowedSigners: `${out.allowedSignersLine}\n`,
    });
    expect(v.code).toBe('bad-signature');
  });

  it('the line is windowed from valid-after: a record made BEFORE the date is unknown-signer', () => {
    const out = generateAgentKey({ ...plan, validAfter: '20270101' });
    if (out.kind !== 'generated') throw new Error(out.reason);
    const r = record(); // recordedAt 2026-09-15, before the window opens
    const sig = execFileSync(
      'ssh-keygen',
      ['-Y', 'sign', '-f', out.keyPath, '-n', VOTE_RECORD_SIGNATURE_NAMESPACE, '-'],
      { input: r.hash, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const v = verifyVoteRecordSignature({
      record: {
        ...r,
        signature: { keyId: plan.principal, namespace: VOTE_RECORD_SIGNATURE_NAMESPACE, sig },
      },
      allowedSigners: `${out.allowedSignersLine}\n`,
    });
    expect(v.code).toBe('unknown-signer');
  });

  it('writes the private key at mode 600 under a 700 directory, plus the .pub', () => {
    const out = generateAgentKey(plan);
    if (out.kind !== 'generated') throw new Error(out.reason);
    expect(statSync(plan.keyPath).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(plan.keyPath)).mode & 0o777).toBe(0o700);
    expect(existsSync(`${plan.keyPath}.pub`)).toBe(true);
    expect(readFileSync(plan.keyPath, 'utf-8')).toContain('PRIVATE KEY');
  });

  it('the outcome carries public material only: fingerprint, public line, allowed_signers line — never the private key', () => {
    const out = generateAgentKey(plan);
    if (out.kind !== 'generated') throw new Error(out.reason);
    expect(out.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/=]+$/);
    expect(out.publicKeyLine.startsWith('ssh-ed25519 ')).toBe(true);
    expect(out.allowedSignersLine).toBe(
      `${plan.principal} namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="${plan.validAfter}Z" ` +
        out.publicKeyLine.split(' ').slice(0, 2).join(' ')
    );
    const privateBody = readFileSync(plan.keyPath, 'utf-8').split('\n')[1] ?? '\0';
    expect(JSON.stringify(out)).not.toContain(privateBody);
    expect(JSON.stringify(out)).not.toContain('PRIVATE KEY');
    // The fingerprint is the one ssh-keygen computes for the .pub.
    const lf = execFileSync('ssh-keygen', ['-lf', `${plan.keyPath}.pub`], { encoding: 'utf-8' });
    expect(lf).toContain(out.fingerprint);
  });

  it('REFUSES to overwrite an existing key, and an existing .pub — nothing is touched', () => {
    const first = generateAgentKey(plan);
    if (first.kind !== 'generated') throw new Error(first.reason);
    const before = readFileSync(plan.keyPath, 'utf-8');
    const again = generateAgentKey(plan);
    expect(again.kind).toBe('refused');
    if (again.kind !== 'refused') throw new Error('unreachable');
    expect(again.reason).toContain('already exists');
    expect(again.reason).toContain('--out');
    expect(readFileSync(plan.keyPath, 'utf-8')).toBe(before);

    // Only the .pub left behind: still a refusal — a half-rotated pair is not overwritten either.
    const other = { ...plan, keyPath: join(dir, 'auth', 'other.key') };
    writeFileSync(`${other.keyPath}.pub`, 'ssh-ed25519 AAAA stale\n', 'utf-8');
    const half = generateAgentKey(other);
    expect(half.kind).toBe('refused');
    expect(existsSync(other.keyPath)).toBe(false);
  });

  it('REFUSES a symlink at the key path, at the .pub, or at the auth directory — dangling ones too (codex review of #6355)', () => {
    // A dangling link is invisible to existsSync, and ssh-keygen would follow it and
    // create the private key wherever the link points. lstat sees the link itself.
    const elsewhere = join(dir, 'elsewhere');
    mkdirSync(elsewhere, { recursive: true });

    const dangling = { ...plan, keyPath: join(dir, 'auth', 'dangling.key') };
    mkdirSync(dirname(dangling.keyPath), { recursive: true });
    symlinkSync(join(elsewhere, 'redirected.key'), dangling.keyPath);
    const viaKey = generateAgentKey(dangling);
    expect(viaKey.kind).toBe('refused');
    if (viaKey.kind !== 'refused') throw new Error('unreachable');
    expect(viaKey.reason).toContain('symlink');
    expect(existsSync(join(elsewhere, 'redirected.key'))).toBe(false);

    const pubLink = { ...plan, keyPath: join(dir, 'auth', 'publink.key') };
    symlinkSync(join(elsewhere, 'redirected.pub'), `${pubLink.keyPath}.pub`);
    const viaPub = generateAgentKey(pubLink);
    expect(viaPub.kind).toBe('refused');
    expect(existsSync(pubLink.keyPath)).toBe(false);

    const linkedDir = { ...plan, keyPath: join(dir, 'auth-link', 'agent.key') };
    symlinkSync(elsewhere, join(dir, 'auth-link'));
    const viaDir = generateAgentKey(linkedDir);
    expect(viaDir.kind).toBe('refused');
    if (viaDir.kind !== 'refused') throw new Error('unreachable');
    expect(viaDir.reason).toContain('symlink');
    expect(existsSync(join(elsewhere, 'agent.key'))).toBe(false);
  });
});

describe('keygenPlan', () => {
  it('defaults: the agent key path, nexus-agent@<host>, today', () => {
    expect(keygenPlan([], DEFAULTS)).toEqual(DEFAULTS);
  });

  it('--out, --principal and --valid-after override the defaults', () => {
    expect(
      keygenPlan(
        ['--out', '/k', '--principal', 'nexus-agent@ci', '--valid-after', '20260102'],
        DEFAULTS
      )
    ).toEqual({ keyPath: '/k', principal: 'nexus-agent@ci', validAfter: '20260102' });
  });

  it('refuses a principal that is not an agent identity — the generated key would verify as owner', () => {
    const out = keygenPlan(['--principal', 'alice@host'], DEFAULTS);
    expect('ok' in out && !out.ok).toBe(true);
    if (!('ok' in out)) throw new Error('unreachable');
    expect(out.error).toContain('nexus-agent@');
  });

  it('refuses a malformed --valid-after, an unknown flag, and a flag without a value', () => {
    for (const argv of [['--valid-after', '2026-01-01'], ['--bogus'], ['--out']]) {
      const out = keygenPlan(argv, DEFAULTS);
      expect('ok' in out && !out.ok).toBe(true);
    }
  });
});

describe('defaultAgentPrincipal / todayUtc / allowedSignersEntry', () => {
  it('the principal is the prefix plus the hostname', () => {
    expect(defaultAgentPrincipal('framework')).toBe('nexus-agent@framework');
  });

  it('todayUtc renders YYYYMMDD in UTC, not the local zone', () => {
    expect(todayUtc(new Date('2026-09-15T23:59:59.000Z'))).toBe('20260915');
    expect(todayUtc(new Date('2026-09-15T00:00:00.000Z'))).toBe('20260915');
  });

  it('allowedSignersEntry drops the key comment and refuses a line that is not a public key', () => {
    expect(allowedSignersEntry(plan, 'ssh-ed25519 AAAAC3 a comment with spaces\n')).toBe(
      `nexus-agent@fixture-host namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="20260101Z" ssh-ed25519 AAAAC3`
    );
    expect(() => allowedSignersEntry(plan, 'garbage')).toThrow('not a public key line');
  });
});

describe('CLI', () => {
  function run(args: readonly string[]): { status: number; output: string } {
    try {
      const output = execFileSync('pnpm', ['exec', 'tsx', SCRIPT, ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, output };
    } catch (error: unknown) {
      const e = error as { status: number | null; stdout: string; stderr: string };
      return { status: e.status ?? -1, output: `${e.stdout}${e.stderr}` };
    }
  }

  it('--out <temp path> generates, prints public material only, and exits 1 on a second run', () => {
    const out = join(dir, 'cli', 'vote-record-signing.key');
    const r = run([
      '--out',
      out,
      '--principal',
      'nexus-agent@cli-host',
      '--valid-after',
      '20260915',
    ]);
    expect(r.status).toBe(0);
    expect(r.output).toContain('fingerprint SHA256:');
    expect(r.output).toContain(
      `nexus-agent@cli-host namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",valid-after="20260915Z" ssh-ed25519 `
    );
    expect(r.output).toContain('not host isolation');
    expect(r.output).not.toContain('PRIVATE KEY');
    expect(r.output).not.toContain(readFileSync(out, 'utf-8').split('\n')[1] ?? '\0');
    expect(statSync(out).mode & 0o777).toBe(0o600);

    const again = run(['--out', out]);
    expect(again.status).toBe(1);
    expect(again.output).toContain('already exists');
  }, 60_000);
});
