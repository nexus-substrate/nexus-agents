---
'nexus-agents': patch
---

docs(security): correct "immutable audit" to tamper-evident append-only audit chain (#3874)

The audit hash-chain threat model (docs/security/audit-hash-chain-threat-model.md,
#3872) established the chain is tamper-EVIDENT, not tamper-PROOF / immutable:
computeEventHash is a KEYLESS SHA-256 over only a partial event projection
({id,timestamp,category,action,outcome,actor,previousHash} plus the tier.\*
tier-transition payload, #3921), so a write-capable adversary can
truncate/fork/rewrite-and-rehash undetectably. Several docs still asserted an
unqualified "immutable audit".

- Replace unqualified "immutable audit" / "immutable" (audit-chain sense) with
  "tamper-evident append-only audit chain" + a link to the threat model in:
  `packages/nexus-agents/README.md` (tagline), root `AGENTS.md`, `CLAUDE.md`
  (both plain prose, above their injected-region markers — no inject needed),
  `docs/getting-started/CONFIGURATION.md`, `docs/architecture/EVENT_BUS_BOUNDARIES.md`,
  and `docs/adr/0018-org-scope-naming.md`.
- Strengthen the existing `hash-chained-audit` claims-registry entry caveat to
  state the keyless-SHA-256 / partial-schema-coverage reality explicitly
  (status stays `partial`; evidence is the threat model + verifyChain /
  computeEventHash in `src/audit/audit-logger.ts`). `claims:check` passes.

The threat model (correct source of truth) and `docs/archive/**` are left
unchanged.
