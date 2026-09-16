/**
 * nexus-agents/audit - Authentic Vote Record (#3897, model revised #3927)
 *
 * A committed, append-only, tamper-EVIDENT record of a completed
 * `consensus_vote`, persisted at vote time so the authority-ladder promotion
 * gate (`scripts/check-authority-tier-drift.ts`, #3895) can rest authenticity
 * on a tamper-evident record set instead of on hand-transcribed YAML.
 *
 * MODEL: TAMPER-EVIDENT RECORD SET + MONOTONIC SEQUENCE (NOT a linear hash
 * chain). #3927 (design vote 7-0, Option B). The original #3897 design was a
 * LINEAR HASH CHAIN: each record's `hash` folded in the prior record's hash, so
 * the order of file lines was load-bearing. That model cannot survive a
 * concurrent-branch git merge — two branches that each append a record from the
 * same tip produce two records claiming the same `previousHash`, and any
 * merge-concatenation breaks the back-link check. The revised model treats the
 * ledger as an UNORDERED SET of self-hashed records plus a monotonic `sequence`
 * number: each record's hash is POSITION-INDEPENDENT (covers `sequence` but NOT
 * `previousHash`), so it is stable across merges and reorders. `previousHash`
 * is retained ADVISORILY for audit texture but does NOT participate in
 * verification. Omission is detected via SEQUENCE GAPS; concurrent forks (two
 * records sharing a sequence) are a BENIGN signal, not a failure.
 *
 * KNOWN GAP IN OMISSION DETECTION (#4011): sequence-gap detection only catches an
 * omission that leaves a HOLE in the `0..maxSeq` run. It does NOT catch the
 * deletion of a FORK PARTNER — when a sequence is shared by ≥2 records and one is
 * removed, the surviving partner still occupies that sequence, so no gap appears
 * and verification still returns `ok`. So a concurrent fork that resolved
 * `approved` + `rejected` can have its `rejected` partner silently dropped. This
 * is consistent with the residual-trust boundary (records are author-typed;
 * a signature is OPTIONAL until the #3927 item 4 phase-3 cutover): a commit-access
 * actor could equally have just never written the rejecting record, so this grants
 * no new capability. Closing it (cross-checking `forks`/`recordCount`, or
 * requiring fork partners to be co-present) is only meaningful once signing raises
 * the overall bar, and folds into #3927 item 4. See the audit-hash-chain threat
 * model for the disclosed boundary.
 *
 * SIGNATURE (#3927 item 4, phases 1-2). A record MAY carry `signature`: a
 * detached `ssh-keygen -Y sign` signature, namespace
 * {@link VOTE_RECORD_SIGNATURE_NAMESPACE}, over the record's committed `hash`
 * string. It is OUTSIDE the self-hash (it is made over the hash) and is
 * verified separately by `vote-record-signature.ts` against the committed
 * `governance/allowed_signers`. `verifyVoteRecordSet` does NOT check it: the
 * set verifier answers "was any record edited", the signature verifier answers
 * "did a listed key sign this hash", and the gate reports the two side by side.
 * What a signature proves is key ACCESS from the signing environment, not a
 * human's presence — see the threat model and #6257.
 *
 * WHY A DEDICATED PAYLOAD-COVERING HASH (and not the audit-event head hash).
 * The audit-event chain (`computeEventHash` in audit-logger.ts) hashes only the
 * stable HEAD fields (id/timestamp/category/action/outcome/actor/previousHash)
 * and intentionally NOT `metadata` — so riding a tier-transition-style metadata
 * payload would leave the vote `decision`/`approvalPercentage` OUTSIDE the
 * hash: an attacker could flip `rejected`→`approved` in the metadata without
 * breaking any hash. That defeats the whole point of #3897. This record instead
 * folds EVERY authenticity-bearing field — the proposal content hash, the
 * decision, the approval percentage, the vote counts, the per-voter summary,
 * and the `sequence` — into the self-hash, so editing any of them is detected
 * as a `hash_mismatch`. This is the tamper-evidence MVP; cryptographic
 * signing/provenance (binding the record to a key) is DEFERRED (#3897 follow-up).
 *
 * NOTE: the separate audit-event/tier-transition chain (`audit-logger.ts`) IS
 * still a real linear hash chain — it has a single-writer runtime and never
 * merges concurrent branches, so the chain model holds there. Only THIS ledger
 * (a multi-branch committable artifact) was converted to a record set.
 *
 * @module audit/vote-record
 */

import * as crypto from 'node:crypto';

import { z } from 'zod';

import {
  HEX_256_PATTERN,
  findReasoningCommitmentDefect,
  isReasoningDigestTier,
  reasoningCommitmentShapeDefect,
} from './reasoning-commitment.js';
import {
  findRedactionDefect,
  redactedRecordReports,
  redactedRolesByTarget,
  type RedactedRecordReport,
  type RedactionFailureReason,
  type RedactionRecord,
} from './redaction-record.js';
import { VoteRecordSignatureSchema } from './record-signature-schema.js';

export {
  VOTE_RECORD_SIGNATURE_NAMESPACE,
  VoteRecordSignatureSchema,
} from './record-signature-schema.js';
export type { VoteRecordSignature } from './record-signature-schema.js';
import { censusSequences, firstSequenceGap, forkSequences } from './sequence-census.js';
import type { CompleteKeys } from './voter-keys-constraint.js';

/** Decision an `approved`/`rejected`/`no_quorum` consensus vote resolves to. */
export const VoteRecordDecisionSchema = z.enum(['approved', 'rejected', 'no_quorum']);
export type VoteRecordDecision = z.infer<typeof VoteRecordDecisionSchema>;

/** Per-voter summary carried in an authentic vote record. */
/** Selection coverage for a multi-option vote (#4472). */
export const VoteRecordOptionCoverageSchema = z
  .object({
    /** Every approving voter, selecting or not — the tally's denominator. */
    approverCount: z.number().int().nonnegative(),
    /** Approvers whose selection matched a declared option. */
    selectedCount: z.number().int().nonnegative(),
    /** Approvers with no usable selection; their choice is unmeasured. */
    unattributedApprovals: z.number().int().nonnegative(),
  })
  .strict();
export type VoteRecordOptionCoverage = z.infer<typeof VoteRecordOptionCoverageSchema>;

/**
 * How much of the requested panel actually voted (#5738, schema 1.5).
 *
 * `voteCounts` and `voters` describe the voters that RESPONDED. An errored
 * voter is dropped from both, so a seven-role panel that lost four of them
 * persisted as a clean three-voter record — and under `reduce_denominator`
 * (the default for every strategy but `unanimous`) a 6-of-7 panel with one
 * dead voter recorded as a unanimous six-voter approval. That is the record a
 * human spot-check of a governor-path merge reads.
 *
 * Measured before this landed: 23 of 199 records in the live ledger carried a
 * denominator that was neither the full panel nor quick mode, with nothing in
 * the record saying why.
 *
 * Same shape of fix as `optionCoverage` (#4472) and for the same reason:
 * recording what did NOT arrive is what makes a partial measurement legible AS
 * partial. Absent when every requested voter responded.
 *
 * Module-private: only the record schema below and the derived type have a
 * consumer. Its two siblings, `VoteRecordOptionCountSchema` and
 * `VoteRecordOptionCoverageSchema`, are exported and the producer/consumer
 * gate already lists both as dead exports — no reason to add a third.
 */
const VoteRecordPanelCoverageSchema = z
  .object({
    /** Voters the panel asked for. */
    requested: z.number().int().nonnegative(),
    /** Voters that returned a usable vote — the denominator of `voteCounts`. */
    responded: z.number().int().nonnegative(),
    /** Voters that errored or timed out. */
    errored: z.number().int().nonnegative(),
    /** The roles behind `errored`, in panel order. */
    erroredRoles: z.array(z.string().min(1).max(100)),
  })
  .strict();
export type VoteRecordPanelCoverage = z.infer<typeof VoteRecordPanelCoverageSchema>;

/**
 * Longest reasoning kept per voter (#5373). Mirrors the CLI display guard from
 * #5372 rather than inventing a second number. A clipped entry says so on
 * itself — a silently truncated argument is the failure this field exists to
 * fix.
 */
export const MAX_VOTER_REASONING_CHARS = 20_000;

/**
 * Clip a voter-entry text to {@link MAX_VOTER_REASONING_CHARS} with a marker
 * (#5373): the returned `truncated` is the flag the record stores beside the
 * text (`reasoningTruncated`, `retriedFrom.errorTruncated`), present only when
 * the clip fired. ONE clip for every bounded voter string — the builder's
 * `reasoningFields` and the live retry's carried cause (#6246) both call this,
 * so there is one number and one marker rule, not a silent slice somewhere.
 */
export function clipForRecord(text: string): { text: string; truncated?: true } {
  if (text.length <= MAX_VOTER_REASONING_CHARS) return { text };
  return { text: text.slice(0, MAX_VOTER_REASONING_CHARS), truncated: true };
}

/**
 * What a recovered seat was retried from, as recorded (#6246, schema 1.12).
 * Module-private on the `SeatFallbackRecordSchema` rule: only
 * `VoterSummarySchema` consumes it. `source` is the live `RetriedFrom['source']`
 * spelled out — an `enum`, not a bare string, so a record cannot claim a first
 * pass the retry never replaces (a `'llm'` seat is not retried) — and the two
 * are held equal by a type test. `error` shares the #5373 bound and marker
 * with `reasoning`: the live retry clips with {@link clipForRecord} before the
 * value reaches the builder, and the schema refuses anything longer.
 */
const RetriedFromRecordSchema = z
  .object({
    /** The first pass's `source`: errored, or answered without reading. */
    source: z.enum(['error', 'unverifiable']),
    /** The first pass's `error` string, when it had one; already clipped. */
    error: z.string().max(MAX_VOTER_REASONING_CHARS).optional(),
    /** True when `error` was clipped to {@link MAX_VOTER_REASONING_CHARS}. */
    errorTruncated: z.literal(true).optional(),
  })
  .strict();

/**
 * A seat's fallback as recorded (#6115, schema 1.9). Module-private on the
 * `VoteRecordPanelCoverageSchema` rule: only `VoterSummarySchema` consumes it.
 * The `reason` enum is the live `FallbackReason` spelled out — an `enum` rather
 * than a bare string so a record cannot carry a class the adapter layer never
 * emits — and the two are held equal by a type test.
 */
const SeatFallbackRecordSchema = z
  .object({
    /** The CLI the seat was assigned to, bare (`claude`, not `cli-claude`). */
    fromCli: z.string().min(1).max(100),
    /** The model the assigned adapter had detected, when it had one. */
    fromModel: z.string().min(1).max(200).optional(),
    /** The adapter-layer class of the error that moved the seat. */
    reason: z.enum(['rate-limit', 'capacity', 'auth', 'timeout', 'sandbox', 'unknown']),
  })
  .strict();

/**
 * The declared field ORDER here is not load-bearing (#6057): canonical hash order
 * comes from `VOTER_SUMMARY_KEYS` below, which is compile-checked against this
 * schema in both directions. Adding a field here without adding it there is a
 * build error, not a silently unhashed field.
 */
export const VoterSummarySchema = z
  .object({
    role: z.string().min(1).max(100),
    decision: z.enum(['approve', 'reject', 'abstain']),
    confidence: z.number().min(0).max(1),
    /**
     * The voter's stated grounds (#5373, schema 1.6).
     *
     * `generateVoteHash` already hashed `{role, decision, reasoning}` and then
     * discarded the text, so the chain attested to a value it did not store and
     * nobody could re-verify the hash without re-obtaining the reasoning. On
     * #5228 a contrarian rejection was clipped mid-sentence in the terminal, the
     * grounds were unrecoverable, and the same defect resurfaced a round later —
     * one round of a 7-voter panel is 7-13 minutes of model time, and the
     * objection was right both times.
     *
     * Stored whole rather than sampled. Warn-mode near-misses are emitted per
     * TOOL CALL, thousands a day; votes are emitted per PANEL, dozens a day at
     * most, so ~17 KB per vote is not the same growth problem.
     *
     * Absence is not an empty argument: an errored voter has no entry in
     * `voters` at all (see `panelCoverage`), so `reasoning: ''` means a live
     * voter returned nothing, which is itself a signal.
     */
    reasoning: z.string().max(MAX_VOTER_REASONING_CHARS).optional(),
    /** True when `reasoning` was clipped to {@link MAX_VOTER_REASONING_CHARS}. */
    reasoningTruncated: z.literal(true).optional(),
    /**
     * True when this seat was recovered by the per-role retry (#6050, schema 1.7).
     *
     * `voter-retry.ts` has set `retried: true` on recovered results since it was
     * written, and `vote-types.ts` states the reason: the flag is "what makes the
     * recovery visible instead of indistinguishable from a clean first attempt".
     * It had one producer and ZERO consumers — both summarizers and the record
     * dropped it — so the field existed, was documented, and never reached
     * anything that could act on it.
     *
     * A retried seat is weaker evidence than a first-pass one: the model was
     * unavailable or timed out, and the recovery ran under different conditions.
     * For a ratification vote on a governor-path change, "7 of 7 answered" and
     * "6 answered, 1 recovered on retry" are different facts about the scrutiny
     * the change received, and the record stated the first for both.
     *
     * `literal(true)` and optional, on the `reasoningTruncated` rule: a clean
     * seat carries no key, so its entry re-hashes byte-identical and every
     * historical record still verifies.
     */
    retried: z.literal(true).optional(),
    /**
     * Registry model id the seat ran on (#6091, schema 1.8).
     *
     * The seat→model mapping is round-robin over the available CLIs plus
     * `NEXUS_VOTER_MODEL_<ROLE>` pins, so it is not recoverable from the
     * ledger after the fact: 1844 voter entries across 278 records carried no
     * model. "When an agent's output becomes evidence, its provenance travels
     * with it" — a tally that says `scope_steward: approve` without saying
     * which model answered cannot be audited for the #6068 failure class.
     * Present-only, on the `retried` rule; absent when the result carried no
     * model or only the pending-detection placeholder.
     */
    model: z.string().min(1).max(200).optional(),
    /**
     * True when the seat could not read the artifact (#6094, schema 1.8).
     *
     * `decision` is `abstain` for such a seat, so without this flag the record
     * could not tell "read it and abstained" from "never saw it" — and one
     * ledger entry (`vote-1789058788915-6lfrbuq`) shows a seat that APPROVED
     * on the proposal text after failing to read. `literal(true)` and
     * present-only, so every pre-1.8 entry re-hashes byte-identical.
     */
    unverifiable: z.literal(true).optional(),
    /**
     * The CLI the round-robin or `NEXUS_VOTER_MODEL_<ROLE>` pin chose for the
     * seat, as a bare name (#6115, schema 1.9). `model` says where a seat
     * answered; this says where it was MEANT to. Three consecutive 7-seat
     * ratification panels on 2026-09-13 answered every seat on one gemini
     * model while the assignment was three claude, two codex, two gemini,
     * and the 1.8 record showed seven identical `model` values with nothing
     * that said five of them were substitutes. Present-only, on the `model`
     * rule; absent on a result built outside the panel launcher.
     */
    assignedCli: z.string().min(1).max(100).optional(),
    /**
     * Present only when the seat answered on a different CLI or model than
     * assigned (#6115, schema 1.9): the exact `SeatFallback` shape the live
     * result carries, rebuilt field-by-field. `fromCli` is the assigned CLI,
     * `fromModel` the model it had detected (absent when it never did — the
     * pending-detection placeholder is not a model), `reason` the adapter
     * layer's error class. The vocabulary is compile-checked against the live
     * `FallbackReason` in vote-record.test.ts; a class one side learns alone
     * would either refuse every record that carries it (#6054) or accept one
     * no producer can write.
     */
    fallback: SeatFallbackRecordSchema.optional(),
    /**
     * Present only when the per-role retry REPLACED this seat (#6246, schema
     * 1.12): the first pass's source and, when it had one, its clipped error
     * string. `retried` (1.7) says a recovery happened; this says what it
     * recovered from. On the #6241 panel a seat recorded `retried: true,
     * unverifiable: true` after a first pass that errored on two response-parse
     * failures, and nothing in the record joined the two — a reader of the
     * ledger and the log together concluded the parse errors had been
     * misclassified (#6244). Rebuilt field-by-field on the `fallback` rule; the
     * `source` vocabulary is compile-checked against the live `RetriedFrom`.
     */
    retriedFrom: RetriedFromRecordSchema.optional(),
    /**
     * The per-entry salt of the reasoning commitment (#6263, schema 1.13;
     * #5748 step 1, panel option A amended with a salt). 32 random bytes as
     * lowercase hex, minted by `mintReasoningNonce` (reasoning-commitment.ts)
     * once per entry.
     *
     * The nonce is the OPENING of the commitment, together with `reasoning`:
     * on the digest tier the record hash folds ONLY `reasoningDigest`, and
     * both text and nonce travel on the record outside the hash
     * (`reasoningTruncated` stays hashed). The salt is the secret (#6274
     * panel 1): hashed, it could not be dropped at redaction without
     * breaking the hash and the #3927 signature; public, it would let
     * `sha256(nonce ‖ guess)` confirm low-entropy reasoning once the text is
     * gone. Outside the hash, a redaction (#6264) drops text and nonce
     * together while the original hash — and any signature over it — still
     * verifies, and the 256-bit unknown salt keeps the digest opaque. The
     * record-level refinement below holds the three together: on 1.13 text
     * and nonce are present or absent TOGETHER and an entry with reasoning
     * carries the digest; on every older tier it carries neither key (there
     * they would be unhashed decoration).
     */
    reasoningNonce: z.string().regex(HEX_256_PATTERN).optional(),
    /**
     * `sha256(reasoningNonce ‖ reasoning)` as lowercase hex (#6263, schema
     * 1.13) — see `computeReasoningDigest` in reasoning-commitment.ts. The
     * commitment to the text: {@link verifyVoteRecordSet} re-opens it
     * whenever nonce and text are both present, so a text edited without
     * re-committing is a `hash_mismatch` exactly as it was when the text
     * itself was folded. A digest nobody re-opens would be a check that
     * cannot fail.
     */
    reasoningDigest: z.string().regex(HEX_256_PATTERN).optional(),
  })
  .strict();
export type VoterSummary = z.infer<typeof VoterSummarySchema>;

/**
 * Identity at runtime; an exhaustiveness constraint at compile time (#6077).
 *
 * The tuple literal only type-checks when every `keyof VoterSummary` appears
 * in it: {@link CompleteKeys} is `unknown` (no-op intersection) when the tuple
 * is complete and `never` when a schema key is missing, so the argument becomes
 * unassignable. Drop `retried` from the tuple below and this call is a `tsc`
 * error, not a silently unhashed field.
 *
 * This exists INSTEAD of a standalone sentinel const because a sentinel
 * survives lint only through the `^_` unused-vars ignore pattern and can be
 * deleted by a dead-code pass with no test failing — the "check that can vanish
 * without a failing test" class. Bound to the tuple's initialization, the check
 * cannot be removed separately from the thing it checks. The `satisfies` on the
 * literal still catches the other direction (a key the schema lacks).
 *
 * The constraint itself lives in `voter-keys-constraint.ts` so that a type test
 * can probe it (#6092): if a TypeScript release stopped resolving it to `never`
 * for an incomplete tuple, `pnpm typecheck` fails there, not silently here.
 */
function defineVoterKeys<T extends readonly (keyof VoterSummary)[]>(
  keys: T & CompleteKeys<keyof VoterSummary, T>
): T {
  return keys;
}

/**
 * THE canonical voter-entry field order (#6057). One source, three consumers:
 * the hash projection iterates it, the schema is checked against it at compile
 * time in both directions, and the builder's output is asserted against it.
 *
 * An EXPLICIT tuple, not `Object.keys(VoterSummarySchema.shape)`, on the
 * ratification panel's refinement: canonical hash order must not depend on the
 * order someone declared keys in a schema, because a formatter or a readability
 * reorder would then silently move every historical hash. Reordering the SCHEMA
 * changes nothing; reordering THIS tuple fails the pinned maximal golden.
 *
 * `satisfies` catches a key the schema lacks (direction 1); the
 * {@link defineVoterKeys} constraint catches a schema key this tuple lacks
 * (direction 2). Both are compile errors, so the "schema-only field" failure
 * mode is closed at build time.
 *
 * DO NOT REORDER. The pinned literal in vote-record.test.ts is the guard.
 */
const VOTER_SUMMARY_KEYS = defineVoterKeys([
  'role',
  'decision',
  'confidence',
  'reasoning',
  'reasoningTruncated',
  'retried',
  // 1.8 (#6091, #6094): appended after `retried`, present-only, so a 1.7
  // entry projects byte-identically.
  'model',
  'unverifiable',
  // 1.9 (#6115): appended after `unverifiable`, present-only, so a 1.8 entry
  // projects byte-identically. `fallback` is the first nested voter field;
  // `projectSeatFallback` rebuilds it in its own canonical order.
  'assignedCli',
  'fallback',
  // 1.12 (#6246): appended after `fallback`, present-only, so a 1.11 entry
  // projects byte-identically. Nested; `projectRetriedFrom` rebuilds it in
  // its own canonical order.
  'retriedFrom',
  // 1.13 (#6263): appended after `retriedFrom`, present-only. Only
  // `reasoningDigest` is ever folded, and only on the digest tier, where
  // `reasoning` above is NOT (`reasoningTruncated` stays folded on every
  // tier); `reasoningNonce` is listed because every schema key must be (the
  // `defineVoterKeys` constraint) but projects to absent on EVERY tier — it
  // is the opening's salt, never hash-covered. `projectVoterField` keys the
  // swap on the record version, so a 1.12 entry still projects
  // byte-identically.
  'reasoningNonce',
  'reasoningDigest',
] as const satisfies readonly (keyof VoterSummary)[]);

/**
 * The 1.13 keys — outside the hash on every TEXT tier, where the schema
 * refuses them anyway (they would be unhashed decoration there).
 */
const REASONING_TIER_KEYS: ReadonlySet<keyof VoterSummary> = new Set([
  'reasoningNonce',
  'reasoningDigest',
]);

/**
 * The OPENING of the commitment — outside the hash on the DIGEST tier: the
 * raw text and its salt, `reasoningNonce`. Both, not the text alone (#6274
 * panel 1): the hash folds only `reasoningDigest`, so a redaction (#6264) can drop
 * text and nonce together while the hash and any signature over it verify
 * unchanged, and the unknown 256-bit salt keeps the digest an opaque
 * commitment rather than a dictionary target. The clip marker
 * `reasoningTruncated` is a boolean with no privacy content that redaction
 * keeps, so it stays folded on every tier like any other present-only key — an
 * unhashed marker would let "this argument was clipped" be erased from a
 * committed record without `hash_mismatch` (#6274 review).
 */
const REASONING_OPENING_KEYS: ReadonlySet<keyof VoterSummary> = new Set([
  'reasoning',
  'reasoningNonce',
]);

/** The record's fallback shape; `VoterSummary['fallback']` minus its optionality. */
type VoterSummaryFallback = NonNullable<VoterSummary['fallback']>;

/** The record's retried-from shape; `VoterSummary['retriedFrom']` minus its optionality. */
type VoterSummaryRetriedFrom = NonNullable<VoterSummary['retriedFrom']>;

/**
 * Identity at runtime; an exhaustiveness constraint at compile time, on the
 * {@link defineVoterKeys} rule. `rest` is what {@link projectSeatFallback}'s
 * destructure did NOT name, and only `{}` is assignable to
 * `Record<string, never>` — so a key added to `SeatFallbackRecordSchema`
 * without the projector learning it is a `tsc` error at the projection, not a
 * silently unhashed nested field (ratification note on #6179).
 */
function noUnprojectedKeys(rest: Record<string, never>): Record<string, never> {
  return rest;
}

/**
 * Rebuild a seat's fallback in canonical order — `fromCli`, `fromModel` (only
 * when present), `reason` — so the hash does not depend on how the nested
 * object's keys were ordered (#3962, the `voteCounts` rule applied one level
 * deeper). Shared with the builder (`vote-record-store.ts`), so the entry the
 * ledger line carries and the entry the hash covers are the same projection.
 *
 * The destructure is exhaustive: {@link noUnprojectedKeys} makes the
 * remainder a compile error unless it is empty. Add a field to the fallback
 * schema and this function stops compiling until the field is placed in the
 * canonical order below.
 */
export function projectSeatFallback(f: VoterSummaryFallback): VoterSummaryFallback {
  const { fromCli, fromModel, reason, ...rest } = f;
  noUnprojectedKeys(rest);
  return {
    fromCli,
    ...(fromModel !== undefined ? { fromModel } : {}),
    reason,
  };
}

/**
 * Rebuild what a seat was retried from in canonical order — `source`, `error`
 * (only when present), `errorTruncated` (only when present) — on the
 * {@link projectSeatFallback} rule (#6246): the hash does not depend on how the
 * nested object's keys were ordered, and the builder shares the projection so
 * the ledger line and the hash cover the same object. The destructure is
 * exhaustive on the {@link noUnprojectedKeys} rule.
 */
export function projectRetriedFrom(r: VoterSummaryRetriedFrom): VoterSummaryRetriedFrom {
  const { source, error, errorTruncated, ...rest } = r;
  noUnprojectedKeys(rest);
  return {
    source,
    ...(error !== undefined ? { error } : {}),
    ...(errorTruncated !== undefined ? { errorTruncated } : {}),
  };
}

/**
 * One voter field for the canonical hash. The two nested keys are rebuilt by
 * their own projectors; every other value is a scalar and is carried as-is.
 *
 * `digestTier` (#6263) is the one place the fold depends on the record's
 * tier: on the digest tier the opening keys (text and nonce) project to
 * ABSENT and the digest is carried; on every other tier the 1.13 keys project
 * to absent and the text is carried exactly as it was — the pinned 1.7–1.12
 * goldens are the guard. The clip marker is carried on BOTH sides of the
 * swap; the nonce on NEITHER. Keyed on the tier and not on key presence so
 * that a stray digest on an old record, or a stray text on a new one, cannot
 * change what the hash covers (the schema refuses both shapes; this makes the
 * fold not depend on that refusal).
 */
function projectVoterField(v: VoterSummary, key: keyof VoterSummary, digestTier: boolean): unknown {
  if (digestTier ? REASONING_OPENING_KEYS.has(key) : REASONING_TIER_KEYS.has(key)) return undefined;
  if (key === 'fallback') {
    return v.fallback === undefined ? undefined : projectSeatFallback(v.fallback);
  }
  if (key === 'retriedFrom') {
    return v.retriedFrom === undefined ? undefined : projectRetriedFrom(v.retriedFrom);
  }
  return v[key];
}

/**
 * Project one voter entry for the canonical hash: every key in
 * {@link VOTER_SUMMARY_KEYS}, in that order, PRESENT-ONLY. An absent optional is
 * omitted, never emitted as `null` — that is what keeps every pre-1.7 record's
 * canonical string byte-identical. The optional flags are `literal(true)`,
 * so `!== undefined` is exactly the old `=== true`.
 */
function projectVoterSummary(v: VoterSummary, digestTier: boolean): Partial<VoterSummary> {
  const out: Record<string, unknown> = {};
  for (const key of VOTER_SUMMARY_KEYS) {
    const value = projectVoterField(v, key, digestTier);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** The vote-count breakdown mirrored from the consensus engine result. */
export const VoteRecordCountsSchema = z
  .object({
    approve: z.number().int().nonnegative(),
    reject: z.number().int().nonnegative(),
    abstain: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type VoteRecordCounts = z.infer<typeof VoteRecordCountsSchema>;

/**
 * One option's share of a multi-option vote (#4452).
 *
 * The approve/reject/abstain tally cannot express WHICH option a voter chose, so
 * a real 6-1 split over options A and C persists as `approve: 7` — indis-
 * tinguishable from genuine unanimity. This carries the distribution.
 */
export const VoteRecordOptionCountSchema = z
  .object({
    /** The option label as declared in the proposal (e.g. 'A'). */
    option: z.string().min(1),
    /** How many voters selected it. */
    count: z.number().int().nonnegative(),
  })
  .strict();
export type VoteRecordOptionCount = z.infer<typeof VoteRecordOptionCountSchema>;

/** A full 40-hex lowercase commit sha — an abbreviated or uppercase form is not a binding. */
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * The `{pr, headSha}` binding of a PR-ratification vote (#5130 step 1, schema
 * 1.10). `pr` is the PR number the panel ratified; `headSha` is the full head
 * commit the panel saw. Exported for the `consensus_vote` input schema and the
 * caller-commits append script, so producer, record and script validate the
 * same shape.
 */
export const VoteRecordPrBindingSchema = z
  .object({
    pr: z.number().int().positive(),
    headSha: z.string().regex(GIT_SHA_PATTERN, 'expected a full 40-hex lowercase commit sha'),
  })
  .strict();
export type VoteRecordPrBinding = z.infer<typeof VoteRecordPrBindingSchema>;

/**
 * Rebuild a PR binding in canonical order — `pr`, then `headSha` — so the hash
 * does not depend on the object's key order (#3962, the `voteCounts` rule).
 * Shared with the builder (`vote-record-store.ts`) on the
 * {@link projectSeatFallback} rule: the object the ledger line carries and the
 * object the hash covers are the same projection.
 */
export function projectPrBinding(b: VoteRecordPrBinding): VoteRecordPrBinding {
  return { pr: b.pr, headSha: b.headSha };
}

/**
 * The error policy a panel ran under, as recorded (#6211, schema 1.11).
 * Module-private on the `SeatFallbackRecordSchema` rule: only
 * `VoteRecordSchema` consumes it. The enum is the live `ErrorPolicy`
 * (`mcp/tools/consensus-vote-types.ts`) spelled out — an `enum` rather than a
 * bare string so a record cannot claim a policy the tool never runs — and the
 * two are held equal by a type test in vote-record.test.ts, so neither side
 * can drift alone.
 */
const VoteRecordErrorPolicySchema = z.enum([
  'reduce_denominator',
  'count_as_abstain',
  'fail_closed',
  'absolute_quorum',
]);

/**
 * One authentic, self-hashed vote record. The `hash` covers every authenticity
 * field INCLUDING `sequence` but EXCLUDING `previousHash`, so the record is
 * tamper-EVIDENT and POSITION-INDEPENDENT: any edit to a persisted line is
 * detected by {@link verifyVoteRecordSet} as a `hash_mismatch`, while reordering
 * file lines or merging concurrent branches does NOT break the hash.
 */
export const VoteRecordSchema = z
  .object({
    /**
     * Schema version. '1.1' marked the chain→record-set+sequence model (#3927);
     * '1.2' adds the optional `ratifies` subject-binding field (#3927 item 1);
     * '1.10' adds the optional `ratifiesPr` PR-binding (#5130); '1.11' the
     * optional `errorPolicy` (#6211); '1.12' the per-voter `retriedFrom`
     * (#6246); '1.13' the per-voter `reasoningNonce` + `reasoningDigest`
     * and — the one tier that changes what an EXISTING key means to the
     * hash — folds those instead of `reasoning` (#6263; the clip marker
     * `reasoningTruncated` stays folded). Every tier is accepted — a 1.1 record
     * (no `ratifies`) verifies unchanged because each optional is folded into
     * the self-hash ONLY when present (see {@link computeVoteRecordHash}).
     * Tiers are labels, not ordered numbers: '1.10' follows '1.9' by
     * convention only and nothing compares them.
     */
    version: z.enum([
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '1.5',
      '1.6',
      '1.7',
      '1.8',
      '1.9',
      '1.10',
      '1.11',
      '1.12',
      '1.13',
    ]),
    /** Unique record id (also usable as a `ratificationVoteRef`). */
    id: z.string().min(1),
    /**
     * Monotonic sequence number (integer ≥ 0). Assigned as (max existing
     * sequence)+1 at write time. Sorted, the set of sequences must cover
     * 0..maxSeq with no gap (omission detection); DUPLICATE sequences are a
     * benign concurrent-fork signal, not tampering.
     */
    sequence: z.number().int().nonnegative(),
    /** ISO-8601 timestamp the vote was recorded. */
    recordedAt: z.string().min(1),
    /**
     * SHA-256 of the FULL proposal text. The proposal itself is truncated for
     * the human record (`proposal`), but the hash binds the record to the exact
     * proposal voted on — a later edit of `proposal` that changes meaning is
     * detectable by recomputing this hash from the original.
     */
    proposalHash: z.string().length(64),
    /** Truncated proposal text for the human/reviewer record. */
    proposal: z.string(),
    /** The voting strategy used. */
    strategy: z.enum([
      'simple_majority',
      'supermajority',
      'unanimous',
      'higher_order',
      'opinion_wise',
      'proof_of_learning',
    ]),
    /** The resolved decision. */
    decision: VoteRecordDecisionSchema,
    /** Approval fraction as a percentage (0-100). */
    approvalPercentage: z.number().min(0).max(100),
    /** Vote-count breakdown. */
    voteCounts: VoteRecordCountsSchema,
    /** Per-voter {role, decision, confidence} summary. */
    voters: z.array(VoterSummarySchema),
    /** Optional correlation/decision id linking to the cost rollup / trace. */
    correlationId: z.string().min(1).optional(),
    /**
     * Per-option distribution for a multi-option proposal (#4452, schema 1.3).
     *
     * Present only when the vote declared `options`. Absent on an ordinary
     * yes/no vote, and absent on every 1.1/1.2 record — which is why it is
     * folded into the self-hash ONLY when present (see
     * {@link computeVoteRecordHash}), exactly as `ratifies` was.
     *
     * Without this, a 6-1 or 5-2 option split is recorded as `approve: 7` and
     * reads as unanimous. Threshold semantics invert too: `unanimous` becomes
     * the EASIEST bar to clear, because every engaged voter approves while
     * choosing different things.
     */
    // No `.min(1)` (#6049). The rule this field's own docstring states is
    // "present only when the vote declared `options`" -- keyed on DECLARATION,
    // not on whether anyone picked one. `.min(1)` encoded the older, narrower
    // rule, so once the builder started emitting `[]` for "declared, nothing
    // attributable" the record appended fine and then failed to parse on read:
    // `too_small, minimum 1`. The write path does not validate, so the line
    // landed in the ledger and `parseVoteRecordsText` silently dropped it --
    // the case most worth auditing became the one no reader could see.
    //
    // Relaxing is a pure widening: no previously-valid record changes meaning
    // or hash, and no persisted record can currently hold an empty tally.
    optionTally: z.array(VoteRecordOptionCountSchema).optional(),
    /**
     * Selection coverage for a multi-option vote (#4472, schema 1.4).
     *
     * `optionTally` alone cannot distinguish dissent from absence: `4 pick X
     * + 3 unreadable` and a genuine 4/3 split both leave a leading share of
     * 57%. Recording how many approvers produced no usable selection is what
     * makes a partial measurement legible AS partial — the condition every
     * voter attached to adopting the "credit no option" rule.
     */
    optionCoverage: VoteRecordOptionCoverageSchema.optional(),
    /**
     * Panel coverage (#5738, schema 1.5). Present only when at least one
     * requested voter failed to return a vote; absent keeps a clean panel on
     * the pre-1.5 projection, so every historical record still verifies.
     */
    panelCoverage: VoteRecordPanelCoverageSchema.optional(),
    /**
     * The loop/strategy subject this vote RATIFIES (#3927 item 1). Present only on
     * a ratification vote; set at vote time and bound into the self-hash (so it is
     * tamper-evident). The authority-tier promotion gate
     * (`scripts/check-authority-tier-drift.ts`) resolves a transition's
     * `ratificationVoteRef` to a record and requires `ratifies === transition.subject`
     * (with `decision === 'approved'` and `strategy === 'higher_order'`). Absent on
     * an ordinary (non-ratification) vote; a 1.1 record never carries it.
     */
    ratifies: z.string().min(1).optional(),
    /**
     * The PR this vote RATIFIES, bound to the head the panel saw (#5130 step 1,
     * schema 1.10; panel decision Q1 option A, 5 of 6). Present only on a
     * governor-path ratification vote; hash-covered like `ratifies`, so a
     * record cannot be repointed at a different PR or a later push without
     * breaking its hash. The governor gate (step 2, #5779/#5131) resolves the
     * record from the committed ledger and requires `pr` to be the PR under
     * review and `headSha` to be its head (or `head^` when `head` touches only
     * the ledger — the caller-commits tip). Absent on every pre-1.10 record.
     *
     * A SEPARATE key rather than a structured encoding of `ratifies`: that
     * field is the authority-ladder SUBJECT, compared by string equality to
     * `transition.subject` and grouped by `conflictingRatifiedSubjects`; no
     * resolver parses it. Overloading it would give one field two consumers
     * with two equality rules. The two may coexist on one record.
     */
    ratifiesPr: VoteRecordPrBindingSchema.optional(),
    /**
     * The error policy the panel actually ran under (#6211, schema 1.11): the
     * EFFECTIVE policy after `consensus_vote` applied the per-strategy default
     * (`input.errorPolicy ?? getDefaultErrorPolicy(strategy)`), not the raw
     * input the caller may have omitted. Hash-covered, present-only.
     *
     * Before this tier the policy reached the RESPONSE only, so the governor
     * ledger gate (`scripts/governor-ledger-evidence.ts`) could not say which
     * policy a whole-panel ratification was configured with: under
     * `absolute_quorum` an errored seat voids the vote, so the one
     * ledger-observable trace of a different policy was an approved record
     * with `panelCoverage.errored > 0` — and a whole panel under
     * `reduce_denominator` looked exactly like one under `absolute_quorum`.
     * The gate's `wrong-error-policy` verdict reads this field; a record
     * without it (every pre-1.11 record) keeps the panel-coverage inference
     * and is reported as `errorPolicy: unrecorded`.
     */
    errorPolicy: VoteRecordErrorPolicySchema.optional(),
    /**
     * ADVISORY hash of the tip record at write time (absent for the first).
     * Retained for audit texture but NOT covered by `hash` and NOT verified —
     * the record-set model is position-independent (#3927).
     */
    previousHash: z.string().length(64).optional(),
    /**
     * Detached SSH signature over the committed `hash` (#3927 item 4, phase
     * 1). The SECOND field outside the self-hash, on `previousHash`'s rule
     * but for the opposite reason: `previousHash` is excluded because it is
     * positional, this because it is made OVER the hash and cannot be inside
     * it. Present-only; absent on every record appended before phase 2 and
     * on any appended without a configured signing key.
     *
     * NOT a schema tier. `version` is hash-covered, and the signature is
     * applied after the committed hash is final (the append script
     * re-sequences, re-hashes, then signs), so a signed 1.11 record is still a
     * 1.11 record and hashes identically with or without this field. A record
     * that lacks it is `unsigned-record` to the verifier
     * (`vote-record-signature.ts`), and the gate reports that informationally
     * until the phase-3 cutover constant makes it a refusal.
     */
    signature: VoteRecordSignatureSchema.optional(),
    /**
     * SHA-256 over every field above EXCEPT `previousHash` and `signature`
     * (and except `hash`).
     */
    hash: z.string().length(64),
  })
  .strict()
  // #6263: the reasoning-commitment keys are tier-bound (see
  // `reasoningCommitmentShapeDefect`). A record that breaks the rule would
  // carry a field its hash does not cover, so the line is refused at write
  // time (#6054) and by every reader, at the voter key that is wrong.
  .superRefine((record, ctx) => {
    const digestTier = isReasoningDigestTier(record.version);
    for (const [i, v] of record.voters.entries()) {
      const defect = reasoningCommitmentShapeDefect(digestTier, v);
      if (defect !== null) {
        ctx.addIssue({ code: 'custom', path: ['voters', i, defect.key], message: defect.message });
      }
    }
  });
export type VoteRecord = z.infer<typeof VoteRecordSchema>;

/** The payload fields (everything except `hash`) — the self-hash projection. */
type VoteRecordPayload = Omit<VoteRecord, 'hash'>;

/**
 * Append the optional fields to the canonical projection, each ONLY when
 * present, in schema order.
 *
 * This is the back-compat rule the whole record set depends on: a record
 * without an optional field re-hashes byte-identical to the form that predates
 * it, so every historical record still verifies. It stays tamper-evident —
 * adding, removing or editing one of these on a persisted record flips the
 * hash.
 *
 * Extracted from {@link computeVoteRecordHash} when `panelCoverage` (#5738)
 * pushed that function past the 50-line cap.
 */
function foldOptionalFields(base: object, payload: VoteRecordPayload): object {
  // `ratifies` (#3927) is folded in ONLY when present, appended after the stable
  // base fields. This keeps the projection BYTE-IDENTICAL to the pre-1.2 form for
  // any record without it — so every historical 1.1 record (which never carried
  // `ratifies`) re-hashes unchanged (back-compat). It stays fully tamper-evident:
  // adding, removing, or editing `ratifies` on a persisted record flips the hash
  // (an absent field re-hashes one way, a present field the other).
  // `optionTally` (#4452) is folded in on the same principle as `ratifies`:
  // ONLY when present, appended after the stable base, with each entry rebuilt
  // field-by-field in schema order. A record without it re-hashes byte-identical
  // to the pre-1.3 form, so every historical record still verifies.
  const withTally =
    payload.optionTally !== undefined
      ? {
          ...base,
          optionTally: payload.optionTally.map((o) => ({ option: o.option, count: o.count })),
        }
      : base;
  // `optionCoverage` (#4472, schema 1.4) follows the same append-when-present
  // rule, inserted after `optionTally` and before `ratifies` so the canonical
  // order matches the schema order. Absent ⇒ byte-identical to the 1.3 form.
  const withCoverage =
    payload.optionCoverage !== undefined
      ? {
          ...withTally,
          optionCoverage: {
            approverCount: payload.optionCoverage.approverCount,
            selectedCount: payload.optionCoverage.selectedCount,
            unattributedApprovals: payload.optionCoverage.unattributedApprovals,
          },
        }
      : withTally;
  // `panelCoverage` (#5738, schema 1.5) follows the same append-when-present
  // rule, after `optionCoverage` and before `ratifies`. Absent ⇒ byte-identical
  // to the 1.4 form, so every historical record re-hashes unchanged.
  const withPanel =
    payload.panelCoverage !== undefined
      ? {
          ...withCoverage,
          panelCoverage: {
            requested: payload.panelCoverage.requested,
            responded: payload.panelCoverage.responded,
            errored: payload.panelCoverage.errored,
            erroredRoles: [...payload.panelCoverage.erroredRoles],
          },
        }
      : withCoverage;
  const withRatifies =
    payload.ratifies !== undefined ? { ...withPanel, ratifies: payload.ratifies } : withPanel;
  // `ratifiesPr` (#5130, schema 1.10) follows on the same rule: present-only,
  // after `ratifies`, rebuilt field-by-field (`pr`, then `headSha`) so the
  // hash does not depend on the binding's key order. Absent ⇒ byte-identical
  // to the 1.9 form; the pinned 1.9 golden is the guard.
  const withPrBinding =
    payload.ratifiesPr !== undefined
      ? { ...withRatifies, ratifiesPr: projectPrBinding(payload.ratifiesPr) }
      : withRatifies;
  // `errorPolicy` (#6211, schema 1.11) is the LAST key: present-only, after
  // `ratifiesPr`, a scalar carried as-is. Absent ⇒ byte-identical to the 1.10
  // form; the pinned 1.10 golden is the guard.
  return payload.errorPolicy !== undefined
    ? { ...withPrBinding, errorPolicy: payload.errorPolicy }
    : withPrBinding;
}

/**
 * Compute the SHA-256 over the canonical payload projection. Unlike the
 * audit-event head hash, this folds in EVERY authenticity-bearing field (so a
 * flipped `decision` or altered `approvalPercentage` changes the hash — the
 * core #3897 property) AND the monotonic `sequence` (#3927) — but it EXCLUDES
 * `previousHash`, so the hash is position-independent and stable across
 * concurrent-branch merges and file reorders, and it EXCLUDES `signature`,
 * which is made over the hash and so cannot be inside it. The projection is built
 * field-by-field (not `JSON.stringify(record)`) so key-order is deterministic
 * regardless of how the object was constructed — and the NESTED objects
 * (`voteCounts` and each `voters[]` element) are likewise rebuilt field-by-field
 * in schema order (#3962). A formatter / `jq -S` / merge tool that reorders the
 * keys of a persisted record must NOT flip a legitimate record to
 * `hash_mismatch`: the hash is independent of key insertion order at every level.
 */
export function computeVoteRecordHash(payload: VoteRecordPayload): string {
  const base = {
    version: payload.version,
    id: payload.id,
    sequence: payload.sequence,
    recordedAt: payload.recordedAt,
    proposalHash: payload.proposalHash,
    proposal: payload.proposal,
    strategy: payload.strategy,
    decision: payload.decision,
    approvalPercentage: payload.approvalPercentage,
    // Rebuild voteCounts in schema order (approve, reject, abstain, total) so the
    // hash does not depend on how the nested object's keys were ordered (#3962).
    voteCounts: {
      approve: payload.voteCounts.approve,
      reject: payload.voteCounts.reject,
      abstain: payload.voteCounts.abstain,
      total: payload.voteCounts.total,
    },
    // `reasoning` / `reasoningTruncated` (#5373, schema 1.6) are appended per
    // entry ONLY when present, on the same rule as the record-level optional
    // fields: a pre-1.6 voter entry re-hashes byte-identical, so every
    // historical record still verifies, while editing or removing a stored
    // reasoning flips the hash. On the digest tier (#6263, schema 1.13) the
    // entry folds `reasoningDigest` INSTEAD of the text, and the salt
    // `reasoningNonce` stays outside the hash with the text (the clip marker
    // stays folded); the text is bound by the digest, which
    // `verifyVoteRecordSet` re-opens with the nonce.
    voters: payload.voters.map((v) =>
      projectVoterSummary(v, isReasoningDigestTier(payload.version))
    ),
    correlationId: payload.correlationId ?? null,
  };
  const canonical = JSON.stringify(foldOptionalFields(base, payload));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** SHA-256 of arbitrary text — used for the proposal content hash. */
export function hashProposal(proposal: string): string {
  return crypto.createHash('sha256').update(proposal).digest('hex');
}

/**
 * Discriminated result from {@link verifyVoteRecordSet}. On success it may
 * surface `forks` — the sequence numbers that appear on more than one record
 * (a benign concurrent-branch signal, NOT tampering) — and `redacted`, the
 * per-record third answer (#6264): each record whose voter openings were
 * dropped under a redaction record that names it. On failure it names the
 * tamper/omission signal: `hash_mismatch` (a record's content was edited, or
 * an opening is absent with NO redaction record naming it — the empty case),
 * `missing_hash` (a record carries no hash), `sequence_gap` (a record is
 * missing from the 0..maxSeq run — an omission), or `redaction_unbound` (a
 * redaction record names nothing it can bind to; `recordIndex` then indexes
 * the REDACTIONS array, as the detail says).
 *
 * NOT detected (#4011): the deletion of a fork PARTNER (a record sharing a
 * sequence with a survivor) leaves no gap, so `ok` stays true. Bounded by the
 * residual-trust boundary (author-typed records; signing deferred to #3927 item
 * 4) — see the module header.
 */
export type VoteRecordVerification =
  | {
      ok: true;
      /** Every record verified — vote records AND redaction records. */
      recordCount: number;
      forks?: number[];
      /** Present only when at least one record is redacted; never `[]`. */
      redacted?: readonly RedactedRecordReport[];
      /**
       * Set when the verified set was EMPTY, so nothing was checked (#5818).
       *
       * `ok: true` alone does not distinguish a verified set from an absent
       * one — the "default reported as a measurement" shape the mission text
       * rules out. Same field name, value and meaning as `verifyChain`'s
       * `notVerified: 'empty'` (`audit-logger.ts`), which was added for exactly
       * this reason; two of the verifiers in this directory already spoke that
       * vocabulary and these two did not.
       *
       * The verdict is deliberately still `ok: true`: an empty ledger is not
       * evidence of tampering, and failing on it would block every governor PR
       * while the ledger has no producer. It is the CALLER's job to say
       * "verified nothing" rather than printing a bare pass.
       */
      notVerified?: 'empty';
    }
  | VoteRecordVerificationFailure;

/** The failure branch of {@link VoteRecordVerification}. */
interface VoteRecordVerificationFailure {
  ok: false;
  reason: 'hash_mismatch' | 'missing_hash' | 'sequence_gap' | RedactionFailureReason;
  recordIndex: number;
  recordId: string;
  detail: string;
}

/** One failure, spelled once. */
function fail(
  reason: VoteRecordVerificationFailure['reason'],
  recordIndex: number,
  recordId: string,
  detail: string
): VoteRecordVerificationFailure {
  return { ok: false, reason, recordIndex, recordId, detail };
}

/** No roles: what a record no redaction record names is checked against. */
const NO_ROLES: ReadonlySet<string> = new Set();

/**
 * Per-record self-hash check; null when the record passes. `redactedRoles`
 * are the voter roles the set's redaction records name on THIS record
 * (#6264) — the commitment check admits an opening-less digest for exactly
 * those roles and refuses it for every other.
 */
function verifyVoteRecord(
  record: VoteRecord,
  index: number,
  redactedRoles: ReadonlySet<string>
): VoteRecordVerificationFailure | null {
  const at = `record at index ${String(index)}`;
  if (record.hash.length === 0) return fail('missing_hash', index, record.id, `${at} has no hash`);
  const recomputed = computeVoteRecordHash(record);
  if (recomputed !== record.hash) {
    const detail = `${at} stored hash=${record.hash} does not match recomputed=${recomputed}`;
    return fail('hash_mismatch', index, record.id, detail);
  }
  // #6263: on the digest tier the hash above cannot see the reasoning text
  // or its nonce, so the commitment is re-opened here. Reported as
  // `hash_mismatch`, not a fourth reason: it is the same fact — a stored
  // field no longer matches what the record attests — and every consumer of
  // the reason set keeps its meaning. An opening dropped under a redaction
  // record naming the entry is not a defect (#6264); dropped under none, it is.
  const commitment = findReasoningCommitmentDefect(record, redactedRoles);
  if (commitment !== null) {
    return fail(
      'hash_mismatch',
      index,
      record.id,
      `${at} reasoning commitment broken: ${commitment}`
    );
  }
  return null;
}

/**
 * Verify a tamper-evident SET of vote records (#3927) and the redaction
 * records that name them (#6264). For each record, the self-hash must
 * recompute from its payload (covers `sequence`, excludes `previousHash`).
 * Order of the arrays does NOT matter — it is a set, not a chain. Semantics:
 *
 * - Any record whose content was edited → `hash_mismatch`. Empty hash →
 *   `missing_hash`. Returns the first such record (array-order scan).
 * - A digest-tier voter entry whose opening (text + nonce) is absent is
 *   `redacted` when a redaction record names its record id and role, and is
 *   reported as such on the success result; absent with NO such record it is
 *   `hash_mismatch` (the named empty case). A redaction record that names
 *   nothing it can bind to → `redaction_unbound`, never ok. The target's
 *   hash is unchanged by a redaction, so a signature over it still verifies.
 * - The set of sequence numbers — vote AND redaction records — sorted, must
 *   cover `0..maxSeq` with no missing value. A GAP (an omitted/deleted record)
 *   → `sequence_gap` naming the first missing sequence.
 * - DUPLICATE sequence numbers are a BENIGN concurrent-fork signal (two branches
 *   appended from the same tip, then merged): NOT a failure. They are surfaced
 *   on the success result as `forks` (the duplicated sequence numbers, ascending).
 *
 * LIMIT (#4011): because a duplicate sequence is benign, deleting ONE partner of a
 * fork leaves the survivor occupying that sequence — no gap, so this returns `ok`.
 * Sequence-gap omission detection therefore does NOT cover a deleted fork partner.
 * This is within the disclosed residual-trust boundary (author-typed records;
 * cryptographic signing is #3927 item 4); callers needing that guarantee must wait
 * for signing, not rely on `verification.ok` alone.
 *
 * An empty set verifies trivially. `redactions` defaults to none, which is
 * fail-closed: a caller that omits them reads a redacted ledger as
 * `hash_mismatch` (and its redaction lines as a `sequence_gap`), never as ok.
 */
export function verifyVoteRecordSet(
  records: readonly VoteRecord[],
  redactions: readonly RedactionRecord[] = []
): VoteRecordVerification {
  // 1) Self-hash every record (order-independent), each against the roles
  //    the redaction records name on it.
  const redactedRoles = redactedRolesByTarget(redactions);
  for (let i = 0; i < records.length; i++) {
    const record = records[i] as VoteRecord;
    const failure = verifyVoteRecord(record, i, redactedRoles.get(record.id) ?? NO_ROLES);
    if (failure !== null) return failure;
  }
  // 2) Redaction records: self-hash, then bind each to a redacted commitment.
  const redaction = findRedactionDefect(redactions, records);
  if (redaction !== null) return { ok: false, ...redaction };

  if (records.length === 0) return { ok: true, recordCount: 0, notVerified: 'empty' };

  // 3) Sequence coverage over BOTH kinds: 0..maxSeq with no gap (omission);
  //    forks are benign.
  const census = censusSequences([...records, ...redactions]);
  const gap = firstSequenceGap(census);
  if (gap !== null) {
    const detail = `sequence gap: missing sequence ${String(gap)} in run 0..${String(census.maxSeq)}`;
    return fail('sequence_gap', 0, (records[0] as VoteRecord).id, detail);
  }

  const forks = forkSequences(census);
  const redacted = redactedRecordReports(records, redactions);
  return {
    ok: true,
    recordCount: records.length + redactions.length,
    ...(forks.length > 0 ? { forks } : {}),
    ...(redacted.length > 0 ? { redacted } : {}),
  };
}
