---
'nexus-agents': minor
---

fix(security): declare the external trust tier on pr_review

`pr_review` registered through `createSecureHandler` with **no `securityTier`**,
so `secure-handler.ts` gave it the permissive `'standard'` default and
`checkSecurityTier` never rejected detected injection patterns.

Everything this tool reviews is attacker-controlled. `buildPrompt` interpolates
`prDescription` — unfenced — and `prDiff` into the voter prompt a few lines
above `"Decide: should it be merged as-is? APPROVE if ..."`. An injection payload
in a PR body therefore sat beside the verdict instruction in front of five model
voters, on a merge-decision path. `.rules/untrusted-input.md` already classifies
PR bodies as Tier 2/3, so this brings the code into line with a rule the repo had
already ratified rather than introducing a new policy.

Found by a coverage audit following #5245, which pinned the `securityTier`
producer→consumer seam but did not ask which tools were missing a tier entirely.
The seam test now covers `pr_review` too, and removing the declaration again
fails it.
