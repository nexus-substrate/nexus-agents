---
'nexus-agents': patch
---

fix(consensus): cancel slow voters cleanly across CLI and API adapters (#3304)

Generalizes the #3311 vote-timeout fix to API-backed voters. The voter request
now also carries an `AbortSignal.timeout(timeoutMs)`: CLI adapters honor
`timeoutMs` (subprocess timeout) and `signal` (#3026 SIGTERM); API adapters
honor `signal` (#3036, aborts the in-flight SDK call). Previously the API-voter
path relied only on the outer `withTimeout` race, which bounded the wait but
left the API call running. Now both adapter types cancel at the vote budget —
CLI-vs-API parity.
