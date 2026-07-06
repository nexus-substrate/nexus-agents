---
'nexus-agents': patch
---

fix(mcp): surface voter transport (in-process gateway vs CLI subprocess) for consensus_vote (#4255)

`consensus_vote` and other voter-agent tools already support routing votes
in-process through an OpenAI-compatible gateway when `NEXUS_OPENAI_COMPAT_URL`
/ `NEXUS_OPENAI_COMPAT_KEY` are set (#4040), but nothing told operators that —
so many harnesses silently ran the slower CLI-subprocess fallback path
(~90s wall time, per-CLI auth/quota dependent) without knowing a faster
option existed.

- **One-time startup notice** (`cli-server-gateway.ts`): when no in-process
  gateway ends up wired — env unset, probe failed, or the gateway returned 0
  models — nexus-agents now logs a single info-level line pointing the
  operator at `NEXUS_OPENAI_COMPAT_URL`/`NEXUS_OPENAI_COMPAT_KEY`. Emitted at
  most once per process (module-level guard), so repeated calls can't spam it.
- **`nexus-agents doctor`**: reports a new "Voter transport" line — "In-process
  gateway" or "CLI subprocess" — based on the same presence check (no network
  probe), so operators can see which transport is active without waiting for
  a real vote.
- **Docs**: `docs/guides/HARNESS_COMPATIBILITY.md` gets a short "voter
  transport / performance" note explaining the two paths generically (no
  vendor/gateway names).

No behavior change to voting itself — this is observability/DX only.
