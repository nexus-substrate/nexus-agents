# Evaluation: Anthropic `defending-code-reference-harness`

**Status:** research spike (#3574). **Source:** <https://github.com/anthropics/defending-code-reference-harness>
— Anthropic reference harness, _"Skills for threat modeling, scanning, triage, patching, plus an
autonomous scanning harness you can /customize."_ **Unmaintained / not accepting contributions** —
treat as a design reference to learn from, not a dependency. Anthropic's productized alternative is
the managed [Claude Security](https://claude.com/product/claude-security) offering.

This doc evaluates what, if anything, to incorporate into nexus-agents. Each area gets an
**adopt / adapt / skip** call with the trigger that would justify acting, gated by the Mission's
capability-bias bar (build only when a named nexus-agents loop will measurably use it).

## What the harness is

An end-to-end **autonomous vulnerability discovery + remediation** pipeline on Claude, in two
surfaces: (a) interactive Claude Code skills (`/quickstart`, `/threat-model`, `/vuln-scan`,
`/triage`, `/patch`, `/customize`); (b) a reference autonomous harness. Python (~93%), Docker/ASAN
build targets, gVisor sandbox. 7-stage pipeline:

> **Build** (Docker + ASAN) → **Recon** (partition attack surface) → **Find** (parallel agents craft
> malformed inputs, hunt crashes) → **Verify** (separate grader reproduces the crash in a fresh
> container) → **Dedupe** (judge agent: unique vs duplicate) → **Report** (exploitability) →
> **Patch** (generate + validate fix).

It is narrow by design (memory-safety bugs in C/C++ via fuzzing-style input crafting + ASAN), where
nexus-agents is a general governance/orchestration substrate. The value to us is the **pipeline
shape and verification discipline**, not the C/C++ specifics.

## Area-by-area

### 1. Execution-verified findings — **ADAPT** (highest-value idea)

Their **Find → Verify-in-fresh-container** loop reproduces each candidate crash in a clean container
before it counts. That is a stronger version of our **Discovered-Issues 4-point gate**
(`.rules/discovered-issues.md`, which is reasoning-based: re-read, trace reachability, name the
observable failure) and our security pipeline (`src/security/`).

- **We have:** reasoning-based reachability/false-positive gating; `pr_review`'s verification gate.
- **Gap:** we don't _execute_ a reproduction to confirm a finding.
- **Adapt:** add an optional **execution-verification step** to the security gate for findings that
  carry a concrete repro (a failing test / input), run in our existing sandbox (see area 5). Don't
  build a fuzzing/ASAN harness — adapt the "separate grader reproduces in a fresh env" principle to
  our finding types (e.g. run the failing assertion the gate names).
- **Trigger:** when a security/finding loop produces findings with machine-runnable repros and the
  false-positive rate justifies the sandbox cost. Until then the 4-point gate stays the bar.

### 2. Find → Verify → Dedupe → Patch staging — **SKIP (already have the shape)**

This is the same adversarial-generate → independent-verify → judge-dedupe shape nexus-agents already
runs via `consensus_vote` (multi-role, independent verification) and the Workflow adversarial-verify
patterns. The dedupe-by-judge step maps to our consensus aggregation.

- **Skip wholesale adoption** — no new staging engine. **One borrowing:** their explicit
  **separate-grader** separation (the agent that finds a bug never verifies it) is a clean rule worth
  making explicit in our verification steps where the same agent currently both finds and confirms.
- **Trigger:** fold the "finder ≠ verifier" rule into the security gate / pr_review docs if an audit
  shows a self-verification path. (Low effort, file as a follow-up only if found.)

### 3. Patch generation + validation — **ADAPT → feeds #3540**

Their **Patch** stage generates a fix and **validates** it (re-run, confirm the crash is gone, no
regressions). This is concretely the "implement" half of the **#3540 auto-implementation frontier**
and our just-shipped `run execute:true` → MetaOrchestrator dispatch.

- **We have:** `run` can already execute dev-pipeline/pipeline strategies for a goal; the gap-ledger
  surfaces what to build; #3540 is scoped with human-gate-on-implement.
- **Adapt:** when #3540 advances, model the **generate-then-validate-then-iterate** loop on their
  patch stage — a fix isn't "done" until a validation step (tests/repro) passes, with bounded
  retries. We already have selective-retry + outcome recording to build on.
- **Trigger:** #3540 implementation start. This is the strongest conceptual borrow for our frontier.

### 4. Skills parity — **ADAPT (small, gap-check)**

Their `/threat-model`, `/vuln-scan`, `/triage`, `/patch` vs our `security-scanning` and
`security-advisory-response` skills (`skills/`).

- **We have:** `security-scanning`, `security-advisory-response`, plus `repo_security_plan` /
  `repo_analyze` MCP tools.
- **Gap:** no dedicated **threat-model** skill (theirs structures attack-surface enumeration before
  scanning); our triage is folded into advisory-response rather than standalone.
- **Adapt:** consider a `threat-model` skill (attack-surface enumeration → prioritized scan targets)
  if a consumer wants it; otherwise skip — don't add skills speculatively (capability-bias).
- **Trigger:** a security review asks "what should we even scan?" often enough to warrant the skill.

### 5. gVisor isolation — **SKIP / note (we have an equivalent)**

Their autonomous agents run inside **gVisor** containers with egress restricted to the Claude API.
We already have **sandbox mode** (`NEXUS_SANDBOX` / `NEXUS_SANDBOX_ROOT`, epic #2500) and **ClawGuard**
access policy (`NEXUS_ACCESS_POLICY_MODE`: off/audit/confirm_risky/enforce).

- **Skip** adopting gVisor specifically. **Note for area 1:** if we add execution-verification, run
  it under the existing sandbox + an egress-restricted profile — borrow their **egress-allowlist**
  posture (network restricted to the model API only) as a sandbox hardening option, not a new runtime.
- **Trigger:** execution-verification (area 1) landing — at which point document/enforce an
  egress-restricted sandbox profile for untrusted-code execution.

## Summary

| Area                                | Call                                   | Why                                                                         |
| ----------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| 1. Execution-verified findings      | **ADAPT**                              | Strongest gap vs our reasoning-only 4-point gate; run repros in our sandbox |
| 2. Find→verify→dedupe→patch staging | **SKIP** (borrow finder≠verifier rule) | We already have the shape via consensus/Workflow                            |
| 3. Patch generate+validate          | **ADAPT → #3540**                      | Direct model for the auto-implementation "implement+validate" loop          |
| 4. Skills parity                    | **ADAPT** (gap-check threat-model)     | Small; only if a consumer wants it                                          |
| 5. gVisor isolation                 | **SKIP/note**                          | We have sandbox #2500 + ClawGuard; borrow egress-allowlist posture          |

**Net:** no wholesale adoption. Two genuine borrows — **execution-verified findings** (area 1) and
the **generate-then-validate patch loop** (area 3, feeding #3540) — both deferred behind their named
triggers per capability-bias. The rest is shape we already have or speculative. Reference only;
extract patterns, do not vendor (unmaintained).

## Follow-ups (file if/when triggered)

- Execution-verification step in the security gate (area 1) — design-gate + sandbox/egress profile.
- `threat-model` skill (area 4) — only with a named consumer.
- Model #3540's implement stage on the generate→validate→iterate loop (area 3).
