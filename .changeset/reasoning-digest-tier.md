---
'nexus-agents': minor
---

Vote records (schema 1.13) hash a salted digest of each voter's reasoning instead of the text (#6263, #5748 step 1).

Every voter entry a `consensus_vote` persists now carries `reasoningNonce` (32 random bytes, hex, fresh per entry) and `reasoningDigest = sha256(reasoningNonce ‖ reasoning)`, computed over the reasoning as stored (after the 20,000-char clip). On this tier the record hash covers the nonce and the digest and not `reasoning` / `reasoningTruncated`, which still travel on the record outside the hash. `verifyVoteRecordSet` re-opens the commitment whenever nonce and text are both present, so a reasoning edited in a persisted record without re-committing still fails as `hash_mismatch` — the tier is as tamper-evident as before while the text is present, and a later step can drop the text while the original hash (and any signature over it) keeps verifying. The salt keeps a dropped text from being recovered by a dictionary over boilerplate prose.

Records on every earlier tier (1.1–1.12) hash exactly as they did; nothing is migrated. The read schema refuses a 1.13 entry that carries reasoning without both keys, and refuses the keys on any older tier. `scripts/append-ratification-record.ts` refuses a source record whose reasoning no longer matches its digest before writing the committed line. New module `audit/reasoning-commitment.ts` exports `mintReasoningNonce`, `computeReasoningDigest`, `isReasoningDigestTier` and `findReasoningCommitmentDefect`.
