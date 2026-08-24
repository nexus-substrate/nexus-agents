---
'nexus-agents': patch
---

fix(security): stop classifying good-faith newcomers as hostile; scan the issue title for injection

Three defects on the untrusted-input path, all reachable in the shipped
configuration now that reputation gating defaults to `enforce`:

- **Tier 4 is the hostile tier, but the generic downgrade could reach it.**
  `new_account` and `no_prior_contributions` both fire automatically for any
  genuine first-time reporter — two readings of one fact, not independent
  evidence — and two signals demoted an `unknown` author (base 3) to 4. Every
  new account's first bug report was refused and escalated to security. The
  generic downgrade now clamps at Tier 3; Tier 4 is reachable only via
  `hostileSignals`.
- **Injection in the title was invisible.** Reputation assessment scanned only
  `issue.body`. An injection payload is plain text, so content-sanitization
  does not strip it from the title — the identical payload was refused at Tier
  4 in the body and raised no signal at all in the title, then reached the
  emitted `SummarizeIssue` verbatim. Title and body are now both scanned.
- **Rule of Two's third conjunct could never be true.** `hasSecretAccess` read
  `config.githubToken`, which no production caller sets; the live credential
  comes from `GITHUB_TOKEN`/`GH_TOKEN` via the SCM provider. It now uses the
  canonical `hasToken()` resolver.
