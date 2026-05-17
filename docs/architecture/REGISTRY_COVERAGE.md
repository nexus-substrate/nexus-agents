---
title: Registry-Coverage CI Gate Design
description: Catch wiring-completeness regressions where registry entries get added but peer files miss the update
tier: 2
keywords: [governance, ci, registry, wiring, coverage, gate]
---

# Registry-Coverage CI Gate

> Design doc for issue [#2405](https://github.com/nexus-substrate/nexus-agents/issues/2405). Implementation tracked in [#2406](https://github.com/nexus-substrate/nexus-agents/issues/2406).

## Problem

A class of bug recurs: a registry gets a new entry, but peer files don't, and the bug ships. Receipts:

- **#2347** — 3 missing `DEFAULT_EXPERTS` entries; the schema, MCP tool, and contract test were updated but the runtime registry wasn't.
- **#2344** — `BuiltInExpertTypeSchema` missing `qa`. Same shape, different missing peer.
- **#2315** — `NEXUS_DATA_DIR` env var was rolled out across most callsites but missed 10. Each missed callsite was a latent prod bug.

These aren't sloppy work — they're systematic gaps. Adding an entry to a registry requires touching N files, and the contract is **implicit** (knowledge of the codebase, not encoded). When the contract is implicit, junior contributors and AI agents both miss peer files.

`scripts/inject-governance.ts check` already enforces wiring completeness for **documentation** registries (CLAUDE.md tool table, README tool table, server.json count, etc.). This design extends the same idea to **behavioral** registries.

## Goals

1. **Catch the class of bug** — when a registry changes, fail CI if known peer files don't.
2. **Mechanical** — no judgment required; the gate either fires or doesn't.
3. **Cheap to add a new registry** — a new manifest entry is the only change; no code changes per registry.
4. **Explicit and reviewable** — peer-file lists live in source, not in agent memory.

## Non-goals

- Detecting peer files automatically (codegen / heuristic). Manifests are explicit on purpose.
- Replacing typecheck. TS already catches type-shape changes; this catches _registration_ changes that are valid TS but wrong at runtime.
- Doc registries. Already covered by `inject-governance.ts check`.

## Approach: manifest-driven

Mirror the `docs/ops/docops-manifest.json` pattern. A new file:

```json
// docs/ops/registry-coverage-manifest.json
{
  "version": "1.0.0",
  "registries": [
    {
      "name": "DEFAULT_EXPERTS",
      "source": "packages/nexus-agents/src/agents/experts.ts",
      "marker": "export const DEFAULT_EXPERTS",
      "peer_files": [
        "packages/nexus-agents/src/agents/expert-types.ts",
        "packages/nexus-agents/src/mcp/tools/list-experts.ts",
        "packages/nexus-agents/src/agents/experts.test.ts"
      ],
      "rationale": "Receipts: #2344, #2347 — every entry added requires schema + MCP + test update."
    }
  ]
}
```

A new script `scripts/check-registry-coverage.ts` runs in CI. Algorithm:

1. Load the manifest.
2. For each registry: get the diff of the source file against the PR base.
3. If the diff touches the marker line or the marker block, flag this registry as "changed."
4. For each changed registry: assert that **every** peer file is also in the changed-files set for the PR. If any peer is missing, fail CI with a specific error message (registry name, missing peer paths, rationale).

Like `check-docops-skill.ts`, it walks the PR commit range when `GITHUB_BASE_REF` is set (lesson from #2411 — escape-hatch and diff-detection both need to do this).

### Failure mode: hard fail

The receipts (#2347, #2344, #2315) shipped to main and required follow-up PRs. They weren't nits. Hard fail in CI is correct. There's no escape hatch — if a registry change genuinely doesn't need the peer file updated, the manifest is wrong; fix the manifest in the same PR.

### Test files: in or out?

In. They are intentionally peer files in this codebase (count-asserting contract tests like `tool-annotations.test.ts:EXPECTED_TOOL_COUNT`). The whole point is that test files **must** update with the registry; that's the contract. Memory note from this codebase already documents this:

> Test files (tool-annotations.test.ts, index.test.ts, cli-server-tools.test.ts) keep their hardcoded counts intentionally — they're contract gates that caught the drift in #2358 and shouldn't become tautologies.

The new gate makes "must update test peers" mechanical instead of contributor-knowledge.

## Seed set

Three registries in scope for the first ship. Each has a documented receipt of a wiring-completeness bug.

### 1. `DEFAULT_EXPERTS` (#2344, #2347)

**Source**: `packages/nexus-agents/src/agents/experts.ts`
**Peer files**:

- `packages/nexus-agents/src/agents/expert-types.ts` — `BuiltInExpertTypeSchema` Zod schema must include the new role.
- `packages/nexus-agents/src/mcp/tools/list-experts.ts` — `getAvailableRoles()` must include the new role.
- `packages/nexus-agents/src/agents/experts.test.ts` — count assertion + role-by-role test.

### 2. `REGISTERED_TOOL_NAMES` (#2358 receipt + active maintenance burden)

**Source**: `packages/nexus-agents/src/mcp/tools/index.ts`
**Peer files**:

- `packages/nexus-agents/src/cli-server-tools.ts` — `STANDALONE_TOOLS` table.
- `packages/nexus-agents/src/cli-server-tools.test.ts` — count assertion.
- `packages/nexus-agents/src/mcp/tools/index.test.ts` — count assertion.
- `packages/nexus-agents/src/mcp/tools/tool-annotations.ts` — annotation entry.
- `packages/nexus-agents/src/mcp/tools/tool-annotations.test.ts` — count assertion.
- `scripts/inject-governance.ts` — `TOOL_DESCRIPTIONS` + `README_TOOL_DESCRIPTIONS`.
- `skills/documentation-management/SKILL.md` — DocOps `<!-- PIPELINE NOTE: ... -->` entry.

(The DocOps gate already enforces `SKILL.md` for `inject-governance.ts` changes — this is intentional belt-and-braces; the new gate makes the registration step explicit.)

### 3. `NEXUS_*` env vars (#2315 — 10 missed callsites)

**Source**: `packages/nexus-agents/src/config/env.ts` (or wherever the typed env enum lives — verify at implementation time)
**Peer files**:

- `CLAUDE.md` — env-var table in the Prerequisites section.
- `docs/getting-started/CONFIGURATION.md` — env-var documentation.
- `packages/nexus-agents/src/config/env.test.ts` — validation test for the new var.

For #2315 specifically, the 10 missed callsites are _consumers_, not peers — they're scattered through the codebase and a manifest can't enumerate them. That's a different problem (covered partially by #2407 schema-fan-out coverage). This gate would catch the **declaration** drift — that the env var is declared in code, the docs, and a test — not the consumer-call drift.

## Risks and tradeoffs

- **Manifest bitrot.** If a peer file is renamed or deleted, the manifest goes stale. Mitigation: the gate fails if a manifest peer file doesn't exist, surfacing the bitrot immediately rather than silently passing.
- **False negatives via manifest gaps.** If a peer file isn't listed in the manifest, the gate misses it. Mitigation: each new wiring-completeness fix-PR is a signal to add a peer; the manifest grows as receipts accumulate.
- **False positives via cross-cutting refactors.** A refactor that legitimately moves logic between files might touch a registry without needing every peer update. Escape: same-PR manifest update (acceptable cost for a refactor), or a small-and-explicit `[skip-registry-coverage:RegistryName]` token that cites the rationale (avoid for v1; only add if friction emerges).
- **Detection of "changed".** Diff-touched line might mean a comment change, not a registration change. Mitigation: marker-block detection (count entries before vs after diff), not line-touched detection.

## Failure cases the gate would have caught

If the gate had existed:

- **#2347** — `experts.ts` diff would have flagged the registry as changed; if the test or MCP tool weren't in the PR, fail CI with `DEFAULT_EXPERTS changed but expert-types.ts not updated`.
- **#2344** — same.
- **#2358** — `tools/index.ts` diff flagged; missing `tool-annotations.ts` annotation entry would fail CI.

For each, the existing fix PR was the gap closer. The gate makes the gap closing **mandatory in the original PR** instead of a follow-up.

## Implementation cost

- New script: `scripts/check-registry-coverage.ts` (~250 LOC, mirrors `check-docops-skill.ts` shape).
- Manifest: `docs/ops/registry-coverage-manifest.json` (3 entries to start).
- New CI job in `.github/workflows/docs-check.yml` (or a new workflow file).
- Unit tests for the script (mirrors `check-docops-skill.test.ts`).

Estimated work: ~half a day. Implementation tracked in #2406.

## Acceptance for the design (this doc)

- [ ] Picks one approach (manifest-driven: yes)
- [ ] Lists the seed-set registries with peer files (3 entries above)
- [ ] Names the failure mode (hard fail, no escape hatch for v1)
- [ ] Calls out test-file inclusion (in)
- [ ] Identifies risks and mitigations

Implementation begins in #2406 once this design lands.
