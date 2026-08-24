---
'nexus-agents': minor
---

Give issue triage a three-state escalation ladder and honest corroboration (#4667)

Three fixes to the untrusted-input path, each closing a check that could not
discriminate.

**Corroboration could not fail.** Every action cited the issue as a
`repoFile` with a synthesised path (`issues/42`), and `hasSourceAtTier` treats
repo files as Tier 1 unconditionally — so untrusted issue text corroborated
actions at maintainer trust. A new `issueBody` source type carries the author
and their tier, so the trust of the content travels with the citation.
`ProposeLabels` is now corroborated for a Tier 1/2 author and **not** for an
untrusted one.

**Rule of Two could not trip.** `hasSecretAccess` was a hardcoded `false`
while the config carried a GitHub token. It is now derived from token presence.

**There was no middle state.** Triage refused at Tier 4 and proceeded
otherwise. `RequestHumanApproval` — one of the seven mandated typed actions,
and previously constructed nowhere — now fires for suspicious-but-not-hostile
input. It is mutually exclusive with refusal, and skipped for allowlisted Tier 1
authors, who are the humans it would escalate to.

The escalation deliberately ignores `no_prior_contributions`: that signal counts
the author's comments _on the issue being triaged_, so it fires for essentially
every newly-filed issue and carries no information. Escalating on it alone would
escalate on everything.
