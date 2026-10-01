---
'nexus-agents': patch
---

Stop retrying voter seats for host-unavailable refusals from the Codex sandbox preflight. Carry the typed host refusal across the CLI-to-model adapter bridge and skip those failed seats in the errored-role retry pass, retaining their original error reason and vote-result shape. Ordinary CLI failures preserve the caller's retry policy, including the structured-output fallback without responseFormat; shared panel deadlines remain unchanged.
