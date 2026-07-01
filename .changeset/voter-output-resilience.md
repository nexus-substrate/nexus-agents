---
'nexus-agents': patch
---

Stop dropping voters on output SHAPE (#4131, epic #4130). The shared voter parser
(`cli/voter-response.ts`) used by `consensus_vote` and `pr_review` previously discarded a
voter — silently removing it from the panel denominator — whenever its output tripped the
parser/schema: (1) reasoning >4000 chars hard-failed validation; (2) `extractJsonFromResponse`
grabbed a ` ```yaml findings ` fence and fed YAML to `JSON.parse`; (3) a large findings vote
was cut mid-JSON by the token cap. The most thorough voter (the contrarian) was the likeliest
to be dropped — exactly the reviewer a panel exists to protect.

Now: extraction prefers a ```json fence, skips non-JSON fences, extracts the first *balanced*
JSON object (string/escape-aware) and repairs a truncated one; oversize `reasoning`/`claim`is truncated with a`…[truncated]` marker instead of hard-rejected; and the vote completion
token cap is raised (2000→4000) so findings-bearing verdicts aren't cut off. A genuinely
malformed vote still errors. (The governance-semantics fix — an errored voter degrading the
verdict instead of shrinking the denominator — is tracked separately in #4132.)
