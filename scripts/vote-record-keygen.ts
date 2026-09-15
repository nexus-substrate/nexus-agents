/**
 * Generate the dedicated AGENT vote-record signing key (#6257 increment 1).
 *
 * The #6257 panel (2026-09-15, option B) gave the autonomous loop its own
 * signing identity: an ed25519 key that lives OUTSIDE any repo checkout at
 * `<dataDir>/auth/vote-record-signing.key` (`~/.nexus-agents/auth/…` on a
 * normal machine — `agentSigningKeyPath()`), listed in
 * `governance/allowed_signers` under the principal `nexus-agent@<hostname>`
 * with `namespaces="nexus-vote-record"`. `append-ratification-record.ts`
 * picks the key up by default when it exists, so a record the loop appends
 * verifies as `signed:agent`; the owner's key is reserved for records a
 * human appends (`--as-owner`).
 *
 * What the script does, and refuses:
 *
 * - `ssh-keygen -t ed25519 -N ''` into the path (mode 0600, parent 0700).
 *   No passphrase: the key must be usable by an unattended process, which
 *   is the whole point — and why it proves WHICH process signed, not that a
 *   human was present (attribution, not host isolation; the threat model
 *   says so).
 * - Refuses to overwrite an existing key or `.pub` — rotation is a NEW path
 *   plus a `valid-before` on the old `allowed_signers` line, never an
 *   in-place replacement that would orphan every record the old key signed.
 * - Prints ONLY public material: the fingerprint, the public key line, and
 *   the ready-to-paste `allowed_signers` entry with `valid-after=<today>`.
 *   The private key's bytes never enter this process.
 *
 * Usage (from the repo root):
 *   pnpm exec tsx scripts/vote-record-keygen.ts [--out <path>] [--principal <name>] [--valid-after <YYYYMMDD>]
 * Then add the printed `allowed_signers` line to `governance/allowed_signers`
 * in a PR — a governor path, ratified like the ledger it vouches for.
 *
 * Operator-run by design (listed in `check-script-wiring.ts` MANUAL_ONLY);
 * the pure half (`keygenPlan`, `allowedSignersEntry`, `generateAgentKey`)
 * is covered by `vote-record-keygen.test.ts` with real ssh-keygen over a
 * temp dir.
 *
 * @module scripts/vote-record-keygen
 * (Source: Issue #6257)
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

import { AGENT_PRINCIPAL_PREFIX } from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import { VOTE_RECORD_SIGNATURE_NAMESPACE } from '../packages/nexus-agents/src/audit/vote-record.js';
import { agentSigningKeyPath } from './append-ratification-signing.js';

/** What one run will do, resolved from argv and the host. */
export interface KeygenPlan {
  /** Private key path; the public half is `<path>.pub`. */
  readonly keyPath: string;
  /** `nexus-agent@<hostname>` unless `--principal` names another. */
  readonly principal: string;
  /** `YYYYMMDD`, UTC; the `valid-after` on the allowed_signers line. */
  readonly validAfter: string;
}

/** The agent principal for this host. */
export function defaultAgentPrincipal(host: string = hostname()): string {
  return `${AGENT_PRINCIPAL_PREFIX}${host}`;
}

/** Today as `YYYYMMDD` (UTC) — the form `allowed_signers` windows are written in. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

const USAGE =
  'usage: vote-record-keygen.ts [--out <path>] [--principal <name>] [--valid-after <YYYYMMDD>]';

/** Parse argv; every option takes a value, nothing unknown. */
export function keygenPlan(
  argv: readonly string[],
  defaults: { readonly keyPath: string; readonly principal: string; readonly validAfter: string }
): KeygenPlan | { readonly ok: false; readonly error: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (!['--out', '--principal', '--valid-after'].includes(flag)) {
      return { ok: false, error: `unknown argument '${flag}'. ${USAGE}` };
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: `${flag} needs a value. ${USAGE}` };
    }
    values.set(flag, value);
    i++;
  }
  const validAfter = values.get('--valid-after') ?? defaults.validAfter;
  if (!/^\d{8}$/.test(validAfter)) {
    return { ok: false, error: `--valid-after must be YYYYMMDD, got '${validAfter}'. ${USAGE}` };
  }
  const principal = values.get('--principal') ?? defaults.principal;
  if (!principal.startsWith(AGENT_PRINCIPAL_PREFIX)) {
    // The verifier classifies by this prefix; a key generated here that is
    // not an agent principal would verify as `owner` and defeat the split.
    return {
      ok: false,
      error: `--principal must start with '${AGENT_PRINCIPAL_PREFIX}' (an agent identity), got '${principal}'.`,
    };
  }
  return { keyPath: values.get('--out') ?? defaults.keyPath, principal, validAfter };
}

/**
 * The `allowed_signers` line for a public key: principal, ONE comma-joined
 * options token (namespace-bound, valid from the date, UTC), key type, key.
 * The key's comment is dropped — the file's principal is the identity, and
 * `ssh-keygen -Y` reads the first two fields of the key only.
 */
export function allowedSignersEntry(plan: KeygenPlan, publicKeyLine: string): string {
  const [type, key] = publicKeyLine.trim().split(/\s+/);
  if (type === undefined || key === undefined) {
    throw new Error(`not a public key line: '${publicKeyLine.trim()}'`);
  }
  return (
    `${plan.principal} namespaces="${VOTE_RECORD_SIGNATURE_NAMESPACE}",` +
    `valid-after="${plan.validAfter}Z" ${type} ${key}`
  );
}

export type KeygenOutcome =
  | {
      readonly kind: 'generated';
      readonly keyPath: string;
      /** `SHA256:…` from `ssh-keygen -lf`. */
      readonly fingerprint: string;
      readonly publicKeyLine: string;
      readonly allowedSignersLine: string;
    }
  | { readonly kind: 'refused'; readonly reason: string };

/** `lstat` that reports absence as `undefined` instead of throwing; every other error propagates. */
function lstatOrUndefined(p: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(p);
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * The nearest EXISTING ancestor of `dir` (including `dir` itself) that is a
 * symlink, or `undefined` when every existing ancestor is a real directory.
 * Walks up until the filesystem root; a missing directory is not a link.
 */
function firstSymlinkAncestor(dir: string): string | undefined {
  let current = dir;
  for (;;) {
    const entry = lstatOrUndefined(current);
    if (entry?.isSymbolicLink() === true) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * Generate the key per the plan. Refuses an existing key or `.pub` at the
 * path (rotation is a new path), an ssh-keygen that cannot run, and a
 * generated file that is not 0600 (ssh-keygen writes it so; a umask or
 * filesystem that widened it must not pass silently). Returns public
 * material only.
 */
export function generateAgentKey(plan: KeygenPlan): KeygenOutcome {
  const pubPath = `${plan.keyPath}.pub`;
  for (const p of [plan.keyPath, pubPath]) {
    const entry = lstatOrUndefined(p);
    if (entry === undefined) continue;
    // lstat, not existsSync: a dangling symlink is invisible to existsSync and
    // ssh-keygen would follow it, writing the private key wherever it points.
    const what = entry.isSymbolicLink() ? 'is a symlink' : 'already exists';
    return {
      kind: 'refused',
      reason:
        `${p} ${what}; this script never overwrites a key or follows a link. To rotate, generate at a ` +
        'new path (--out) and add valid-before to the old allowed_signers line.',
    };
  }
  const linkedAncestor = firstSymlinkAncestor(dirname(plan.keyPath));
  if (linkedAncestor !== undefined) {
    return {
      kind: 'refused',
      reason: `${linkedAncestor} is a symlink; the key directory must be a real directory (the key would be created wherever the link points).`,
    };
  }
  mkdirSync(dirname(plan.keyPath), { recursive: true, mode: 0o700 });
  const generated = runKeygen(plan);
  if (generated !== undefined) return { kind: 'refused', reason: generated };
  const mode = statSync(plan.keyPath).mode & 0o777;
  if (mode !== 0o600) {
    return {
      kind: 'refused',
      reason: `${plan.keyPath} was written with mode ${mode.toString(8)}, not 600; remove it and fix the umask.`,
    };
  }
  const fingerprint = fingerprintOf(pubPath);
  if (!fingerprint.ok) return { kind: 'refused', reason: fingerprint.reason };
  const publicKeyLine = readFileSync(pubPath, 'utf-8').trim();
  return {
    kind: 'generated',
    keyPath: plan.keyPath,
    fingerprint: fingerprint.fingerprint,
    publicKeyLine,
    allowedSignersLine: allowedSignersEntry(plan, publicKeyLine),
  };
}

/** `ssh-keygen -t ed25519 -N ''` at the plan's path; the failure reason, or `undefined` on success. */
function runKeygen(plan: KeygenPlan): string | undefined {
  const comment = `${plan.principal} vote-record signing key`;
  const gen = spawnSync(
    'ssh-keygen',
    ['-q', '-t', 'ed25519', '-N', '', '-C', comment, '-f', plan.keyPath],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  if (gen.error !== undefined) return `ssh-keygen -t ed25519 failed: ${gen.error.message}`;
  if (gen.status !== 0) return `ssh-keygen -t ed25519 failed: ${gen.stderr.trim()}`;
  return undefined;
}

/** `SHA256:…` from `ssh-keygen -lf` over the public half. */
function fingerprintOf(
  pubPath: string
):
  | { readonly ok: true; readonly fingerprint: string }
  | { readonly ok: false; readonly reason: string } {
  const lf = spawnSync('ssh-keygen', ['-lf', pubPath], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const fingerprint = /(SHA256:[A-Za-z0-9+/=]+)/.exec(lf.stdout)?.[1];
  if (lf.status !== 0 || fingerprint === undefined) {
    return {
      ok: false,
      reason: `ssh-keygen -lf could not fingerprint ${pubPath}: ${lf.stderr.trim()}`,
    };
  }
  return { ok: true, fingerprint };
}

function main(): void {
  const plan = keygenPlan(process.argv.slice(2), {
    keyPath: agentSigningKeyPath(),
    principal: defaultAgentPrincipal(),
    validAfter: todayUtc(),
  });
  if ('ok' in plan) {
    console.error(`[vote-record-keygen] ${plan.error}`);
    process.exit(1);
  }
  const out = generateAgentKey(plan);
  if (out.kind === 'refused') {
    console.error(`[vote-record-keygen] ${out.reason}`);
    process.exit(1);
  }
  console.log(`[vote-record-keygen] generated ${out.keyPath} (ed25519, mode 600, no passphrase).`);
  console.log(`[vote-record-keygen] fingerprint ${out.fingerprint}`);
  console.log(`[vote-record-keygen] public key: ${out.publicKeyLine}`);
  console.log(
    '[vote-record-keygen] add this line to governance/allowed_signers (governor path — ratified in a PR):'
  );
  console.log(out.allowedSignersLine);
  console.log(
    `[vote-record-keygen] append-ratification-record.ts will sign with it by default; the gate will print ` +
      `signed:agent by ${plan.principal}. This attributes the append to this process; it is not host isolation.`
  );
}

if (process.argv[1]?.endsWith('vote-record-keygen.ts') === true) {
  main();
}
