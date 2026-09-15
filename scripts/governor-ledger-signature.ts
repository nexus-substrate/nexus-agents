/**
 * The signature half of the committed-ledger evidence (#3927 item 4).
 *
 * `governor-ledger-evidence.ts` decides whether a record RATIFIES a PR; this
 * module says who SIGNED it. It builds the verifier the workflow runs — the
 * real `verifyVoteRecordSignature` over the `allowed_signers` beside the
 * ledger (`governance/allowed_signers` for the committed one, or the path
 * `RATIFICATION_ALLOWED_SIGNERS_PATH` names for a test over an ephemeral
 * key) — and renders each bound record's verdict for the evidence line:
 * `signed by <keyId>`, `unsigned-record`, `unknown-signer`, `bad-signature`,
 * `signature-not-measured`, distinct and never collapsed, with ssh-keygen's
 * reason where there is one.
 *
 * Informational this phase: the verdicts ride on the evidence and never
 * change its `kind` or the gate's exit code. Phase 3 enforces past a
 * committed cutover sequence. An `allowed_signers` that cannot be read makes
 * every record `signature-not-measured` naming the path — on the line, not
 * as a gate `unmeasured`, because the rest of the evidence is still measured.
 * A caller that supplies no verifier at all is said as such (`unmeasured (no
 * verifier supplied)`); absence is not reported as `unsigned-record`.
 *
 * A governor path, like the evidence module it serves: a gate an agent can
 * quietly weaken is not a gate.
 *
 * @module scripts/governor-ledger-signature
 * (Source: Issue #3927 item 4)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type { VoteRecordSignatureVerdict } from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import {
  ALLOWED_SIGNERS_FILE,
  verifyVoteRecordSignature,
} from '../packages/nexus-agents/src/audit/vote-record-signature.js';

/**
 * Overrides the allowed_signers path (default: {@link ALLOWED_SIGNERS_FILE}
 * beside the ledger); for tests that drive the real verifier over an
 * ephemeral key.
 */
export const ALLOWED_SIGNERS_PATH_ENV = 'RATIFICATION_ALLOWED_SIGNERS_PATH';

/** One bound record's signature verdict, named by record. */
export interface RecordSignatureReport {
  readonly recordId: string;
  readonly verdict: VoteRecordSignatureVerdict;
}

/** The verifier the evidence runs over each bound record. */
export type SignatureVerifier = (record: VoteRecord) => VoteRecordSignatureVerdict;

/**
 * The verifier for the workflow's environment: the real one over the
 * allowed_signers file, or — when that file cannot be read — one that
 * answers `signature-not-measured` naming the path for every record.
 */
export function signatureVerifierFromEnv(
  env: NodeJS.ProcessEnv,
  ledgerPath: string
): SignatureVerifier {
  const path =
    (env[ALLOWED_SIGNERS_PATH_ENV] ?? '').trim() || join(dirname(ledgerPath), ALLOWED_SIGNERS_FILE);
  let allowedSigners: string;
  try {
    allowedSigners = readFileSync(path, 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `the allowed_signers at ${path} could not be read (${message})`;
    return () => ({ code: 'signature-not-measured', reason });
  }
  return (record) => verifyVoteRecordSignature({ record, allowedSigners });
}

/** One verdict's text: the code, the identity where the verdict has one, ssh-keygen's reason where there is one. */
function signatureVerdictBody(verdict: VoteRecordSignatureVerdict): string {
  switch (verdict.code) {
    case 'signed':
      return `signed by ${verdict.keyId}`;
    case 'unsigned-record':
      return 'unsigned-record';
    case 'unknown-signer':
    case 'bad-signature':
      return `${verdict.code} '${verdict.keyId}' (${verdict.reason})`;
    case 'signature-not-measured':
      return `signature-not-measured (${verdict.reason})`;
  }
}

/**
 * `signature: …` for the evidence line. One bound record is the usual case
 * and reads without its id; several are each named. No verifier supplied is
 * said as such — it is not `unsigned-record`.
 */
export function formatSignatures(signatures: readonly RecordSignatureReport[] | undefined): string {
  if (signatures === undefined) return 'signature: unmeasured (no verifier supplied)';
  if (signatures.length === 1) {
    return `signature: ${signatureVerdictBody((signatures[0] as RecordSignatureReport).verdict)}`;
  }
  return `signature: ${signatures
    .map((s) => `'${s.recordId}' ${signatureVerdictBody(s.verdict)}`)
    .join('; ')}`;
}
