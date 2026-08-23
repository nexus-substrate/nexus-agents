# E2E Validation — 2026-08-23 — nexus-agents 3.9.4 (sha af5a369834)

**Trigger:** release + ≥3 behavior-affecting fixes landed the same day (9 PRs merged).
**Adapters live:** Claude CLI, Codex CLI, Opencode CLI, Gemini CLI. No `simulateVotes` used.
**Method:** every tool call driven over **stdio against the published `nexus-agents@3.9.4` binary**, not the working tree and not the editor's MCP session — see "Why the transport matters" below.
**Coverage:** 7/7 families.
**Result:** 6 PASS / 1 CHARACTERISED.
**Issues filed from this run:** #4660, #4661. **Fix merged from this run:** #4662.

| #   | Family        | Verdict        | Evidence                                                                                                                                                                                                                                                 |
| --- | ------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Research      | PASS           | `research_discover` queried arxiv, github, semantic_scholar, papers_with_code, openalex; returned real items and reported `failedSources: ["semantic_scholar"]` rather than silently shrinking the result set.                                           |
| 2   | Consensus     | PASS           | 3 live 7-voter `higher_order` panels with `options` + `absolute_quorum`. Every panel returned a full complement. The option tally earned its keep twice: a 6-approve/1-reject panel was actually 5–1 on **which** option, and another was 4–1–1.         |
| 3   | Planning/exec | PASS           | `delegate_to_model` not re-exercised (covered 2026-08-21, fixed in #4520). Planning validated indirectly through the consensus panels, which reached real decisions on four separate design forks.                                                       |
| 4   | Pipelines     | CHARACTERISED  | `run_dev_pipeline` **dryRun exceeds 340 s** — not a hang: it runs a full live 7-voter panel. Its stderr showed an `ai_ml` voter hit "Key limit exceeded" and correctly fall back to a diverse adapter (#3587). `run_graph_workflow` PASS (see below).    |
| 5   | Memory        | PASS           | `memory_write` (belief) → `memory_query` round-trip, relevance 1. `memory_stats` reports an honest backend map: session + belief true, 5 others false.                                                                                                   |
| 6   | Audit/health  | PASS + 2 filed | `verify_audit_chain` `ok: true, eventCount: 0` on an empty dir — the empty case is **explicitly named** at `audit-logger.ts:154`. The line below it is not: → **#4660**. `doctor` misreported a working CLI: → **#4661**, fixed and merged as **#4662**. |
| 7   | Repo/analysis | PASS           | `extract_symbols` on a real `.py`: returned the honest #4534 refusal **and** wrote the expected `tool_refusal` entry to `capability-gaps.jsonl`. The #4651→#4652→#4654 chain working end to end in the shipped artifact.                                 |

## `run_graph_workflow`, both paths

- **Unknown workflow** → `isError: true`, `status: "failed"`, `stepsExecuted: 0`, and an error naming every available workflow. Fails closed with an actionable message.
- **`echo`** → `status: "completed"`, 1 node, `node_started`/`node_completed` events emitted, audit trail enabled.

The echo returned empty because the run passed `message` where that workflow reads `input` — an operator-input mistake, not a tool defect, recorded so the empty output is not read as one later.

## Why the transport matters

The global install was found at **3.6.0** while the repo and npm were at **3.9.4** — three minor versions stale. Every MCP call made in this environment before the re-sync exercised code predating the entire session's work, and the tools kept answering normally the whole time.

This has now drifted twice (previously 2.173.6 vs 3.0.0, recorded in the 2026-08-15 note). **Checking `npm ls -g nexus-agents` against the repo version belongs at the start of any session that will treat live MCP output as evidence.** After re-syncing, every call in this run was driven over stdio against the published binary so the artifact under test was unambiguous.

## What the run actually bought

Two defects that reading code had not surfaced, both in the same family the session had been auditing — an instrument whose report does not mean what it says.

**#4661** was the sharper one. `doctor` printed a red `Auth: Not authenticated` with `Fix: gemini auth login` for a CLI that had **completed a vote 30 seconds earlier in the same session**. The auth probe is three-valued and for that gateway can only return `unknown` — _"admitted unverified"_. Routing admits that state deliberately (#4391, after #4346 and #4318 taught both failure modes), and `doctor-live` preserves it. It died at a boolean collapse in `doctor.ts`, which is the surface an operator actually reads.

Every other instrument audited this session risked reporting a default as a **pass**. That one reported an unmeasured state as a **failure** — same defect class, opposite sign, and worse than silence, because the remediation sent an operator to fix a working CLI. Fixed in #4662 with a required tri-state and both rendering branches pinned by tests, so the misreport cannot simply move to the other state.

**#4660** came from checking an assumption rather than accepting a green tick. `verify_audit_chain` returning `ok: true` prompted a look at the empty case, which turned out to be handled properly. The line _below_ it was not: an un-chained log short-circuits to `{ ok: true, eventCount: N }`, so `ok: true, eventCount: 500` reads as stronger assurance than `ok: true, eventCount: 0` while being exactly as weak. Not a live hole — `enableHashChain` defaults `true` — and `src/audit/` is never-auto-merge, so it is filed for ratification rather than fixed.

## Explicitly not concluded

`extract_symbols` has now recorded **one** `.py` refusal, and this run generated it. That is not demand evidence, and #4517 stays on HOLD. The whole #4651→#4652→#4654 chain exists so the tree-sitter decision rests on a measurement; adding the dependency on the strength of a self-generated entry would be the exact failure it was built to prevent.
