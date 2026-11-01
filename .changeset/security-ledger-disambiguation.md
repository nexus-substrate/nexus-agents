---
'nexus-agents': minor
---

feat(security-ledger): disambiguate legacy finding identities via content digest (#7652)

Enable resolution of historical findings in `.security-discoveries.jsonl` that share identical timestamps without unique `id` fields. Resolvers and `pnpm sec:resolve` support content-bound targeting via SHA-256 digest (`--target sha256:<hex>`). Original historical lines and bytes remain immutable. Ambiguous target errors list candidate finding digests to guide operators.
