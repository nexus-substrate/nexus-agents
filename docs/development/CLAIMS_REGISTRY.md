---
title: Claims Registry Guide
description: How to add and verify claims so README/ARCHITECTURE assertions can't silently drift from the code
tier: 2
keywords: [claims, registry, governance, drift, verification, contributing]
related_files:
  - governance/claims-registry.yaml
  - scripts/claims-check.ts
  - packages/nexus-agents/src/governance/claims-registry.ts
  - packages/nexus-agents/src/governance/claims-verify.ts
---

# Claims Registry Guide

**Tier 2** | Read before adding a substantive claim to `README.md` or `ARCHITECTURE.md`

The claims registry is a **claims-to-reality registry**: a machine-verifiable
inventory of the substantive assertions our top-level docs make about the
system. Each entry pairs a human-readable claim with a `verification` recipe a
script runs against live source. When a doc claim and the code drift apart, the
`claims:check` gate fails CI instead of shipping a stale promise.

This is the same single-source-of-truth pattern as `governance:check`
(`scripts/inject-governance.ts`): the doc is downstream, the code is the source
of truth, and a blocking gate keeps them honest.

- Registry: [`governance/claims-registry.yaml`](../../governance/claims-registry.yaml)
- Schema + loader: [`packages/nexus-agents/src/governance/claims-registry.ts`](../../packages/nexus-agents/src/governance/claims-registry.ts)
- Verification runner: [`packages/nexus-agents/src/governance/claims-verify.ts`](../../packages/nexus-agents/src/governance/claims-verify.ts)
- Gate script: [`scripts/claims-check.ts`](../../scripts/claims-check.ts)
- CI job: **Claims Registry Drift** in `.github/workflows/docs-check.yml` (blocking)

---

## When you must add an entry

Add (or update) a registry entry whenever a PR introduces or changes a
**substantive, falsifiable claim** in `README.md` or `ARCHITECTURE.md` — a
count ("47 MCP tools", "12 expert types"), a capability ("audit trail is
hash-chained"), or a roadmap status ("standalone CLI is Phase 2, not shipped").

If you can't point the claim at a live source of truth, soften the prose
instead of adding an unverifiable entry. The gate exists to stop claims the
script cannot prove.

---

## Entry shape

Each item under `claims:` in `governance/claims-registry.yaml` has these fields
(validated by the Zod schema in `claims-registry.ts`):

| Field          | Required | Meaning                                                                     |
| -------------- | -------- | --------------------------------------------------------------------------- |
| `id`           | yes      | Stable kebab-case identifier, never reused                                  |
| `claim`        | yes      | Human-readable claim text, capped at 25 words                               |
| `subject`      | yes      | Repo-root-relative doc that makes the claim (e.g. `README.md`)              |
| `status`       | yes      | `verified` \| `partial` \| `aspirational` \| `stale`                        |
| `evidenceType` | yes      | `test` \| `gate` \| `eval-artifact` \| `adr` \| `source`                    |
| `verification` | yes      | Recipe the runner executes: `method`, `path`, optional `expected`, `symbol` |
| `lastVerified` | yes      | `YYYY-MM-DD` the entry was last manually confirmed                          |
| `caveat`       | no       | Note surfaced in reports; use it to explain a `partial` claim               |

`status` values mean:

- `verified` — backed by live evidence the runner checks every CI run.
- `partial` — backed, but with a documented `caveat` (e.g. a small-n eval).
- `aspirational` — roadmap only; allowed when the subject doc marks it roadmap.
- `stale` — known-broken backing, tracked so it can't regress to silent.

`evidenceType` categorizes what backs the claim: a `test`, a CI `gate`, an
`eval-artifact`, an `adr`, or the `source` itself.

---

## Verification methods

The `verification.method` picks how the runner
([`claims-verify.ts`](../../packages/nexus-agents/src/governance/claims-verify.ts))
proves the claim. Pick the narrowest method that actually proves it.

| Method                | `expected` | `symbol` | What a green check guarantees                                            |
| --------------------- | ---------- | -------- | ------------------------------------------------------------------------ |
| `file-exists`         | unused     | unused   | The evidence `path` resolves to an existing file                         |
| `file-contains`       | string     | unused   | The evidence file exists and contains the `expected` substring           |
| `enum-member-count`   | number     | required | The named `z.enum([...])` / string-union `symbol` has `expected` members |
| `manifest-tool-count` | number     | unused   | The tool-manifest file registers exactly `expected` MCP tools            |
| `roadmap-status`      | string     | unused   | The subject doc still marks the feature roadmap (contains the token)     |

Notes:

- `expected` is **numeric** for the counting methods (`enum-member-count`,
  `manifest-tool-count`) and a **string** for `file-contains` / `roadmap-status`.
  `file-exists` ignores it.
- `symbol` is **required** for `enum-member-count` and names the exported
  `z.enum` const (or a `type X = 'a' | 'b'` string union) to count.
- Use `roadmap-status` for `aspirational` claims: point `path` at the doc whose
  roadmap row marks the feature unshipped, and set `expected` to that row token.

---

## How to add or update a claim

1. Find the live source of truth for the claim (the file/symbol the code owns).
2. Add an entry to `governance/claims-registry.yaml` under `claims:`, choosing
   the narrowest verification method that proves it. Give it a fresh,
   never-reused `id` and set `lastVerified` to today.
3. Run `pnpm claims:check` locally and confirm the entry reports `ok`.
4. Keep the doc prose and the entry in lockstep — if you change the claim text
   in `README.md`/`ARCHITECTURE.md`, update the entry (and `lastVerified`).

### Worked example

`README.md` states the system exposes **47 MCP tools**. The source of truth is
the MCP tool manifest, so the entry uses `manifest-tool-count`:

```yaml
- id: mcp-tool-count
  claim: 'README states the system exposes 47 MCP tools.'
  subject: README.md
  status: verified
  evidenceType: source
  verification:
    method: manifest-tool-count
    path: packages/nexus-agents/src/mcp/tools/tool-manifest.ts
    expected: 46
  lastVerified: '2026-06-16'
```

If someone adds a 47th tool to the manifest without updating the README and the
registry, `claims:check` fails: `manifest has 47 tools, expected 46`. The
contributor reconciles the README prose, bumps `expected` to `47`, refreshes
`lastVerified`, and the gate goes green again.

For an `aspirational` claim, use `roadmap-status` and point `expected` at the
roadmap-row token in the subject doc (see the `standalone-cli-roadmap` entry).

---

## Running the gate locally

```bash
pnpm claims:check
```

The gate loads `governance/claims-registry.yaml`, validates it against the Zod
schema, then verifies every claim against live source. It prints `ok <id>` per
claim and exits non-zero on any drift — a missing evidence path, a vanished doc
substring, a count mismatch, or an aspirational claim whose roadmap marker
disappeared. The CI job **Claims Registry Drift** runs the same command and
blocks merge on failure.

---

## Related Documents

- **Contributor hub:** [development/README.md](./README.md)
- **PR workflow:** [CONTRIBUTION_GUIDE.md](./CONTRIBUTION_GUIDE.md)
- **Governance contributing notes:** [CONTRIBUTING.md](../../CONTRIBUTING.md)
