---
'nexus-agents': minor
---

`issue_triage` and `pr_review` now evaluate every action's policy through `HostileInputFirewall` (#5383): each action is one `process({ action, existingLabels })` run and the decision is read from `FirewallResult.policy`, so the dogfooding path has one composition instead of a firewall beside a direct `evaluatePolicy` call. The verdicts are unchanged in every `NEXUS_FIREWALL_POLICY` mode — under `off` and `audit` the caller still enforces `policy.allowed` as `policyApproved` / the review-posting block; under `enforce` a refused action lands on the same record as `policyApproved: false` with its rules. Two things a consumer will notice: each per-action decision now reaches the durable audit trail as a `policy_gate` record (the direct call recorded nothing), and a triage or posted review emits one `trust_classification` record per firewall run — the classification plus one per action — instead of one. A run whose policy stage did not evaluate the action, or that enforced a different tier than the classification, fails the tool closed instead of recording a verdict.

`FirewallError` gains an optional `violations` list: a `POLICY_REFUSED` from the policy stage now carries the blocking violations it refused on, so a consumer can record the rule ids without parsing the message.
