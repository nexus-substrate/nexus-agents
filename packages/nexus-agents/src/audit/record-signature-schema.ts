/**
 * The signature envelope every committed ledger record — a vote record
 * (`vote-record.ts`) or a redaction record (`redaction-record.ts`, #6372) —
 * may carry OUTSIDE its hash. Lives in its own module because both record
 * modules import it and `vote-record.ts` already imports `redaction-record.ts`.
 *
 * @module audit/record-signature-schema
 */
import { z } from 'zod';

/**
 * The `ssh-keygen -Y` namespace every vote-record signature is made and
 * verified under (#3927 item 4). A namespace binds a signature to ONE
 * purpose: a key that also signs git commits (`git`) or files (`file`) cannot
 * have one of those signatures replayed as a ratification, and the committed
 * `governance/allowed_signers` restricts the operator's key to this namespace
 * alone. Pinned by a literal test; a drift here turns every existing
 * signature into `bad-signature` (ssh-keygen: "namespace does not match").
 */
export const VOTE_RECORD_SIGNATURE_NAMESPACE = 'nexus-vote-record';

/**
 * A detached SSH signature over the record's committed `hash` (#3927 item 4,
 * phase 1; panel decision option B, 5 of 6).
 *
 * `keyId` is the principal the signature claims — the identity the verifier
 * looks up in `governance/allowed_signers` (`ssh-keygen -Y verify -I`).
 * `namespace` is the literal above, carried on the record so a reader can see
 * what the signature was made under without re-deriving it. `sig` is the
 * armored `-----BEGIN SSH SIGNATURE-----` block exactly as `ssh-keygen -Y
 * sign` emits it.
 *
 * The SIGNED MESSAGE IS THE `hash` STRING (64 lowercase hex characters, no
 * newline) — never a re-serialised JSON form of the record. The #3927 re-vote's
 * contrarian objected that JSON canonicalisation is brittle across runtimes;
 * signing the hash makes that moot, because one TypeScript projection already
 * produces the hash and every gate consumes it, and a second verifier in any
 * language verifies the signature over that string without re-canonicalising.
 * Signing the hash also signs everything the hash covers, `sequence` included,
 * so the chain position is signed too.
 */
export const VoteRecordSignatureSchema = z
  .object({
    /** The allowed_signers principal, e.g. `williamzujkowski@nexus-agents`. */
    keyId: z.string().min(1).max(200),
    namespace: z.literal(VOTE_RECORD_SIGNATURE_NAMESPACE),
    /** The armored SSH signature block, verbatim. */
    sig: z.string().min(1).max(8192),
  })
  .strict();
export type VoteRecordSignature = z.infer<typeof VoteRecordSignatureSchema>;
