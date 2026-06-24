---
name: e2e-validation
description: |
  Periodically exercise ALL nexus-agents feature families end-to-end against a
  real task — research → synthesize → vote → plan → dev-pipeline → graph workflow
  → memory → audit — capturing ACTUAL outputs to validate that fixes, docs, and
  claims hold in real usage (the things unit tests miss: live voter panels,
  adapter routing, pipeline stage wiring, audit chains). Use after a release,
  weekly, when several fixes have landed since the last run, or on demand.
  Triggers on "e2e validation", "end-to-end validation", "dogfood the loops",
  "validate end to end", "real usage test", "periodic validation run",
  "full-loop validation".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Task, WebSearch, WebFetch
---

# End-to-End Validation Skill

Unit tests prove a function does what its test says. They do **not** prove the
real loops work: that the live voter panel actually returns 7 votes, that
`run_dev_pipeline` wires every stage, that routing picks a reachable adapter,
that the audit chain verifies. This skill runs the **real** loops with live
adapters and compares observed behavior against what the code, docs, and recent
"fixed" claims assert. Where reality diverges, it files a tracked issue.

> Why this exists: this is dogfooding for **validation**, not implementation.
> `dogfooding-issues` implements open issues; `dev-pipeline` runs one pipeline;
> `system-review` is a static health check. This skill is the periodic _real-usage
> smoke test of the whole substrate_.

## When to run

- **After every release** (a published version is a claim that the loops work).
- **Weekly**, or once **≥3 behavior-affecting fixes** have landed since the last run.
- **On demand** when a claim is in doubt (e.g., "the voter race is fixed").

Record the trigger in the report. One run per trigger is enough — don't loop it.

## Preconditions (fail closed)

1. **Live adapter required.** Confirm at least one real CLI/model adapter is
   authenticated (`nexus-agents doctor`). This skill validates _real_ behavior —
   **never** use `consensus_vote { simulateVotes: true }` (random output, #2319)
   or any simulate/mock path. If no live adapter is available, record every step
   as `BLOCKED` and stop — do not fabricate a pass.
2. **Cost awareness.** Real loops spend tokens. If work is cost-gated, note it and
   get authorization before the full run; a reduced run (e.g. `--quick` votes,
   `dryRun` pipelines) is an acceptable partial — label it as such.
3. **Note the versions.** Capture the installed `nexus-agents` version and git SHA
   so the report is reproducible.

## The loop — exercise every feature family

Pick one **real, non-trivial seed task** (a genuine backlog item works best, so the
run produces real value). Drive it through the families below, capturing the
**actual** tool output each step. Don't paraphrase success — paste/observe the real
result and judge it.

| #   | Family        | Tools to exercise                                                                                  | What "real" validates                                                                 |
| --- | ------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Research      | `research_discover`, `research_synthesize`, `research_query`                                       | discovery returns results; synthesis preserves provenance                             |
| 2   | Consensus     | `consensus_vote` (run BOTH `--quick` 3-voter AND full 7-voter, `higher_order` + `simple_majority`) | **all** voters return — catches dead/404 voters (e.g. #3497), OAuth races, escalation |
| 3   | Planning/exec | `orchestrate`, `execute_expert`, `delegate_to_model`                                               | adapter routing picks a reachable model; expert personas resolve                      |
| 4   | Pipelines     | `run_dev_pipeline` (dryRun → real), `run_pipeline`, `run_graph_workflow`                           | every stage wired; no missing-stage / template-resolution gaps                        |
| 5   | Memory        | `memory_write`, `memory_query`, `memory_stats`                                                     | writes persist and read back; counts move                                             |
| 6   | Audit/health  | `verify_audit_chain`, `ci_health_check`, `query_trace`                                             | the run left a verifiable audit trail; traces resolve                                 |
| 7   | Repo/analysis | `repo_analyze`, `search_codebase`, `extract_symbols`                                               | analysis tools run against this repo                                                  |

Adapt the set to what changed since the last run — but a full periodic run should
touch all seven families at least once.

## Capture protocol

For each step record: **what you ran**, the **actual output** (or error), the
**claimed/expected** behavior (from code/docs/changelog), and a verdict —
`PASS` / `FAIL` / `BLOCKED` / `PARTIAL`. A vague "seemed to work" is a FAIL of the
capture, not a PASS of the step.

On a real failure, follow the orchestrator-fallback rule (one retry max, then treat
as a blocker — never silently retry past it) and apply the **Q Protocol** to triage.

## On mismatch → file a tracked issue

When observed behavior contradicts a claim (a "fixed" bug that reproduces, a doc that
lies, a dead voter, a missing stage), file a GitHub issue per the Discovered-Issues
4-point gate — this is canonical tracking, not a memory note.

- **OPSEC:** scrub government / organization / provider references from titles,
  bodies, and pasted output; generalize to "the configured provider" / "an upstream
  provider". Keep the technical content. The auto-file path applies the
  operator-configured `NEXUS_SENSITIVE_REFS` denylist automatically — set it locally
  to your org's terms (they are intentionally not hardcoded in this repo).
- Cite the run (version + SHA), paste the real evidence, and link the claim it
  contradicts (changelog line, doc, or issue that declared it fixed).

## Output — a short validation report

Close with a report (post to the tracking issue and/or `docs/ops/`):

```
E2E Validation — <date> — nexus-agents <version> (<sha>)
Trigger: <release | weekly | N fixes | on-demand>
Coverage: 7/7 families  | Adapters live: <which>
Result: <PASS n> / <FAIL n> / <BLOCKED n> / <PARTIAL n>
Issues filed: #.... , #....
Notes: <one or two lines on anything surprising>
```

Keep it to ~10 lines. The value is the issues filed and the honest verdict, not prose.
