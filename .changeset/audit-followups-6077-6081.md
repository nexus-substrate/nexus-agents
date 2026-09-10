---
'nexus-agents': patch
---

Two follow-ups in the audit module (#6077, #6081).

The compile-time check that every `VoterSummary` schema key appears in the canonical hash-order tuple `VOTER_SUMMARY_KEYS` was a standalone sentinel constant that only survived lint through the `^_` unused-vars ignore pattern; a dead-code pass could delete it with no test failing and the hash projection would then silently omit a new field. The check is now bound to the tuple's initialization through a `defineVoterKeys` identity helper whose generic constraint rejects an incomplete tuple, so it cannot be removed separately from what it checks. Dropping a schema key from the tuple and adding an unknown key are both `tsc` errors. The canonical hash order and every pinned golden hash are unchanged.

The source-checkout write guard's refusal message told the reader to "pass repoPath to a throwaway repo, or set" the per-ledger environment variable. Neither store's persist function takes a `repoPath` option, and for the vote ledger the environment variable is usually the very thing that pointed at the tracked file, so following the advice reproduced the refusal. The remedy now says to point the variable (or the explicit `filePath`) at a throwaway path such as a temp directory. The `#4415` rationale sentence is unchanged.
