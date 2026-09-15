---
'nexus-agents': minor
---

Vote-record signatures now say which process appended a record (#6257 increment 1, panel option B).

- `verifyVoteRecordSignature`'s `signed` verdict carries `principal` and `signerKind` (`'agent'` for a `nexus-agent@<host>` principal, `'owner'` for any other) alongside the existing `keyId` — an additive widening, never a bare boolean. New exports `signerKindOf`, `AGENT_PRINCIPAL_PREFIX` and the `VoteRecordSignerKind` type from the audit barrel.
- The governor ledger gate prints `signed:agent by <principal>` / `signed:owner by <principal>` on `ratified` and `ratified-rebased` lines (was `signed by <keyId>`). The exit code still does not depend on the signature this phase.
- `scripts/vote-record-keygen.ts` generates a dedicated ed25519 agent signing key OUTSIDE any checkout at `~/.nexus-agents/auth/vote-record-signing.key` (mode 600, no passphrase, refuses to overwrite) and prints only public material plus the ready-to-paste `governance/allowed_signers` line.
- `scripts/append-ratification-record.ts` signs with that agent key by default when it exists (`--signing-key`, then `NEXUS_VOTE_SIGNING_KEY`, still win), and REFUSES an owner-principal signature unless `--as-owner` is passed, so an automated run cannot claim human presence by accident. `--as-owner` with the agent key, or with no key, is refused as a misconfiguration.
- `governance/allowed_signers` lists the operator host's agent key as `nexus-agent@framework`.

Stated plainly in `governance/README.md` and the audit threat model: this is honest attribution of which process appended, not host isolation — both keys live on the operator's host and the split adds no non-repudiation against a compromise of it. CI/OIDC-issued keys are #6350; phase-3 enforcement is #6279.
