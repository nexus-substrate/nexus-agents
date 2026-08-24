---
'nexus-agents': patch
---

fix(security): never let an agent propose a label that grants privilege or skips review

Labels in this repository are not all descriptive taxonomy — some are CI
control inputs. `owner-ratified` is the label `check-governor-ratification.ts`
accepts as proof of ratification, so applying it bypasses the
governance-of-the-governor gate on `src/audit/`, `.rules/` and `CODEOWNERS`.
`skip-pr-review` suppresses the review workflow.

`ProposeLabels` was constrained only by "must exist in the repository label
set", which these do. No production code applies a proposed label today
(`addLabels` has no non-test caller), so the path is latent — but it stops
being latent the moment triage output is wired to `addLabels`, and a guard
added after that wiring is a guard added after the incident.

Proposals naming a privilege-granting label are now refused with
`PRIVILEGED_LABEL`. The check keys on the action's effect, not the author's
trust: an OWNER-authored body proposing its own ratification is exactly the
self-modification the governor exists to prevent. It is also independent of
`checkLabelValidity`, which returns early when the repository label set is
unknown — a denylist layered on that would inherit the vacuous pass.
