---
title: 'Your First Task'
description: 'Install, verify, see a real consensus vote, then plug into your editor. ~5 minutes.'
tier: 1
keywords: [getting-started, first-task, smoke-test, tutorial, onboarding]
related_files: [./INSTALLATION.md, ./CONFIGURATION.md, ./PLUGIN_INSTALL.md]
---

# Your first task

A focused tutorial: install → verify → run a real consensus vote → wire it into your editor. About 5 minutes if you have Node 22; less if everything's already installed.

This is the canonical new-user path. If you want platform-specific install details, jump to [INSTALLATION.md](./INSTALLATION.md). If you want every knob enumerated, jump to [CONFIGURATION.md](./CONFIGURATION.md). For Claude Code plugin install specifically, see [PLUGIN_INSTALL.md](./PLUGIN_INSTALL.md). Everything below stays on the canonical "first 5 minutes" path.

---

## 1. Install

```bash
npm install -g nexus-agents
```

If you hit `EACCES` on Linux/macOS, configure a user-local npm prefix instead of using `sudo` ([details](./INSTALLATION.md#install-without-sudo)).

For Claude Code, you can install as a plugin instead:

```
/plugin install nexus-agents
```

---

## 2. Verify

```bash
nexus-agents doctor
```

Prints a health table:

```
Nexus Agents Doctor
===================

Checking environment...

✓ Node.js version: v22.x.x
⚠ API keys configured: 0 of 3
  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_AI_API_KEY

Checking CLI installations...

✓ Claude CLI    Version: 2.x  Auth: CLI auth
✓ Codex CLI     Version: 0.x  Auth: CLI auth
⚠ Gemini CLI    Auth: Not authenticated   Fix: gemini
```

Read-only; safe to run any time. If you have **at least one** working CLI (claude / codex / gemini), you can run the next step without setting any API keys — nexus-agents will use whatever CLI is configured.

---

## 3. Run a real consensus vote (no API keys needed)

```bash
nexus-agents vote --quick --proposal "Use SQLite over JSON files for the outcome store"
```

Three voter roles (`architect`, `security`, `scope_steward`) deliberate via whichever local CLIs you have. Expected output:

```
Nexus Agents Consensus Vote
============================

Collecting votes from 3 agents (timeout: 60s each)...

Proposal: Use SQLite over JSON files for the outcome store

Votes

  ✓ Software Architect: APPROVE (86%)
  ✓ Security Engineer:  APPROVE (74%)
  ✓ Scope Steward:      APPROVE (91%)

Summary

  Approve:  3
  Reject:   0
  Abstain:  0
  Approval: 100.0%
  Threshold: simple_majority

Result: APPROVED

Completed in ~30s
```

That's the smoke task. The verdict prints; the vote tally and per-voter confidence are recorded. For the richer 7-voter version (which also demonstrates mixed APPROVE/REJECT outcomes and graceful error handling), see the [project site hero](https://nexus-substrate.github.io/nexus-agents/).

---

## 4. Wire into your editor (optional but recommended)

```bash
nexus-agents setup
```

Auto-configures nexus-agents as an MCP server in Claude Code, Cursor, OpenCode, Gemini, and Codex (whichever you have). Restart the editor; the 46 MCP tools (`orchestrate`, `consensus_vote`, `research_synthesize`, `verify_audit_chain`, …) become available to whatever agent you're already using.

`setup` writes/updates up to seven things — each opt-outtable with the corresponding `--skip-*` flag. The full breakdown is in the [project README](../../README.md#what-setup-configures); if you'd rather configure one CLI at a time, run `setup --interactive` (the default).

---

## 5. Try a real task

```bash
# Run a real orchestration task (uses an API key if available)
export ANTHROPIC_API_KEY=your-key
nexus-agents orchestrate "Explain the architecture of this codebase"
```

Or via the MCP tool (after `setup`):

```
In Claude Code: /orchestrate "Explain the architecture of this codebase"
```

The 12-stage CompositeRouter picks the right CLI, the right expert persona, and the right model based on task analysis. The trace goes to `<repo>/.nexus-agents/traces/` for later replay (`traces/` is per-repo state — epic #2872).

---

## Where to go next

| Want to …                                                           | Read                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Chain tools into a goal** (research → vote → build)               | [COMPOSE_YOUR_FIRST_PIPELINE.md](./COMPOSE_YOUR_FIRST_PIPELINE.md)              |
| Understand the consensus voting strategies                          | [CONSENSUS_PROTOCOLS.md](../architecture/CONSENSUS_PROTOCOLS.md)                |
| Understand the routing pipeline                                     | [ROUTING_SYSTEM.md](../architecture/ROUTING_SYSTEM.md)                          |
| Configure model preferences, custom experts, sandbox modes          | [CONFIGURATION.md](./CONFIGURATION.md)                                          |
| Wire an editor we don't auto-detect                                 | [../guides/HARNESS_COMPATIBILITY.md](../guides/HARNESS_COMPATIBILITY.md)        |
| Run the full dev pipeline (research → plan → vote → implement → QA) | `run_dev_pipeline` MCP tool — see [../ENTRYPOINTS.md](../ENTRYPOINTS.md)        |
| Inspect the audit chain                                             | `verify_audit_chain` MCP tool, or the JSONL under `<repo>/.nexus-agents/audit/` |
| Browse the research registry                                        | [../research/RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)                  |
| See every CLI command + MCP tool                                    | [../ENTRYPOINTS.md](../ENTRYPOINTS.md)                                          |
