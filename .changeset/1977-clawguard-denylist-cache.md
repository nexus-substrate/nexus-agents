---
'nexus-agents': minor
---

feat(security): ClawGuard denylist + policy cache (#1977 partial)

Extends the access-constraint-deriver skeleton (#1993) with two
vote-approved conditions from the design review of #1977:

**Condition 3: Hardcoded unbypassable denylist** (`denylist.ts`)

A list of file-path patterns and tool names that no LLM-derived policy
may override. Applied FIRST in the enforcer, before the per-task policy
check. Malicious user objectives or poisoned LLM output cannot grant
access to credentials/secrets because the denylist rule wins regardless.

Path patterns cover: `.env` files, SSH keys, AWS/Azure/GCP/kube creds,
`/etc/shadow`, `/etc/sudoers`, common secret file patterns.

Tool names cover: force-pushes, destructive git/fs operations, identity
mutations, remote destruction.

**Condition 5: Policy cache** (`cache.ts`)

In-memory LRU cache keyed by objectiveHash. Avoids re-derivation on
repeated invocations of the same task. Default capacity 256 entries
with LRU eviction. Singleton with reset for tests.

**Enforcer now takes an optional `args.path`** so file-path denylist
matching works. Existing callers (none in production yet — skeleton
not wired to dispatch) unaffected.

## Still remaining for #1977 full implementation

- [ ] Condition 1: UnifiedAdapterRegistry LLM call with regex fallback
- [ ] Condition 4: Trust-tier gating on objective input
- [ ] Condition 6: Empirical <500ms p95 validation before enforce mode
- [ ] Dispatch path wiring (MCP tool boundary hook)

## Validation

- 51 tests across 3 files (17 original + 18 denylist + 16 cache/enforcer extension)
- Full security suite: all passing
- typecheck clean
- TypeDoc regenerated
