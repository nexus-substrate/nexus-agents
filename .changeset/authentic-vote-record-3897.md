---
'nexus-agents': patch
---

fix(governance): persist authentic vote records at vote time (#3897)

The authority-ladder promotion gate (#3895) resolves a `ratificationVoteRef`
against the committed `governance/ratification-votes.yaml` ledger, but that
ledger is hand-committable — the gate verifies STRUCTURAL PRESENCE, not
AUTHENTICITY, so anyone who can land a commit can forge a conforming entry. Live
`consensus_vote` results previously persisted only to per-developer home-dir
stores (`~/.nexus-agents/voting`, `~/.nexus-agents/learning`) that CI cannot
read.

This change persists each completed `consensus_vote` to a committed,
append-only, tamper-EVIDENT artifact at vote time
(`governance/vote-records.jsonl`), so authenticity rests on a hash chain rather
than on manual YAML transcription.

**Design.** A dedicated payload-covering hash chain (`src/audit/vote-record.ts`)
rather than riding the existing audit-event head hash. The audit-event chain
(`computeEventHash`) folds only the stable HEAD fields and intentionally NOT
`metadata`, so a tier-transition-style metadata payload would leave the vote
`decision`/`approvalPercentage` OUTSIDE the chain — an attacker could flip
`rejected`→`approved` without breaking any hash. The vote record instead folds
EVERY authenticity-bearing field (proposal content hash, decision, approval
percentage, vote counts, per-voter summary) into the chained hash, so editing
any of them is detected as a `hash_mismatch`. The record is written as a
best-effort side effect of the existing vote path (`recordAuthenticVote` in
`consensus-vote-recording.ts`) — no new MCP tool, the tool ceiling is respected.

**Gate seam (next step).** `readVoteRecords` + `verifyVoteRecordChain` are the
tested seam a future `check-authority-tier-drift.ts` revision uses to resolve a
`ratificationVoteRef` against the committed records and reject a chain that
fails verification. This PR does not rewire the gate.

**Deferred.** Cryptographic signing / provenance-stamping (binding the record to
a key — the AI/ML voter's stretch goal) is deferred to a follow-up. Tamper-
EVIDENCE via the hash chain is the MVP; tamper-PROOF signing is later.
