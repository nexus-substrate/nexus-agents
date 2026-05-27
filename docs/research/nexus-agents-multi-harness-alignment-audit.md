# Nexus-Agents Multi-Harness Alignment Audit

**Purpose.** Seed a structured review of `williamzujkowski/nexus-agents` against the
Claude Certified Architect — Foundations exam guide and the equivalent
authoritative documentation from every other harness `nexus-agents` already
adapts (`codex`, `codex-mcp`, `gemini`, `opencode`) plus the broader AGENTS.md
ecosystem (Cursor, Aider, Continue, Amp). The document is structured to be
paste-able into `claude` / `nexus-agents orchestrate` and runnable as an
end-to-end audit through `pr_review` + `consensus_vote`.

**How to use this document.**

1. Drop this file at `docs/research/multi-harness-alignment-audit.md`.
2. Feed it to Claude CLI with `claude --resume "$(cat docs/research/multi-harness-alignment-audit.md)"`
   or as the seed prompt for `nexus-agents orchestrate "$(cat ...)"`.
3. The "Gap Analysis Tasks" section (§6) is the work backlog. Each task has a
   file scope, an acceptance criterion, and a voter-role assignment from
   `agents/index.yaml`. Use `pr_review` per task and `consensus_vote` for the
   architectural gates flagged with ⚖️.
4. Findings go into `docs/research/multi-harness-alignment-results-v1.md`
   (skeleton in §8), mirroring `pr-review-experiment-results-v5.md`.

---

## §0 Preflight

Before starting, the reviewing agent must:

- [ ] Confirm read access to every URL in §1. If any are unreachable, note in
      the results doc and proceed with the rest. **Do not** invent details for
      unreachable sources.
- [ ] Confirm the canonical paths in `AGENTS.md` still exist
      (`src/cli-adapters/composite-router.ts`, `src/mcp/tools/index.ts`,
      `src/consensus/engine.ts`, `src/config/model-registry.ts`,
      `src/security/index.ts`, `agents/index.yaml`, `skills/index.yaml`,
      `.rules/`).
- [ ] Load the rule files relevant to MCP and governance work:
      `.rules/mcp.md`, `.rules/governance.md`, `.rules/subagent-coordination.md`,
      `.rules/untrusted-input.md`, `.rules/security.md`.
- [ ] Run `nexus-agents governance:check` (or `inject-governance.ts check`)
      first; if drift is already failing, fix drift before starting alignment
      work.

---

## §1 Reference Corpus

Each entry is the authoritative source for that vendor or primitive. Last verified
2026-05-13.

### 1.1 Anthropic — Claude Code, Agent SDK, MCP, API

| #   | Title                                                                               | URL                                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Claude Certified Architect — Foundations Exam Guide (v0.1, Feb 2025)                | Provided as `instructor%2F8lsy243ftffjjy1cx9lm3o2bw%2Fpublic%2F1773274827%2FClaude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf` on the Everpath S3 bucket. Treat as confidential (NTK-marked); do **not** reproduce verbatim. |
| A2  | Building effective agents (Schluntz & Zhang, Dec 2024)                              | https://www.anthropic.com/engineering/building-effective-agents                                                                                                                                                                                          |
| A3  | Claude Code: Best practices for agentic coding (Cherny, Apr 2025)                   | https://www.anthropic.com/engineering/claude-code-best-practices                                                                                                                                                                                         |
| A4  | How we built our multi-agent research system (Jun 2025)                             | https://www.anthropic.com/engineering/multi-agent-research-system                                                                                                                                                                                        |
| A5  | Writing effective tools for agents — with agents (Sep 2025)                         | https://www.anthropic.com/engineering/writing-tools-for-agents                                                                                                                                                                                           |
| A6  | Building agents with the Claude Agent SDK (Sep 2025)                                | https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk                                                                                                                                                                          |
| A7  | Effective context engineering for AI agents (Sep 2025)                              | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents                                                                                                                                                                        |
| A8  | Equipping agents for the real world with Agent Skills (Oct 2025)                    | https://www.anthropic.com/engineering/agent-skills                                                                                                                                                                                                       |
| A9  | Beyond permission prompts: making Claude Code more secure and autonomous (Oct 2025) | https://www.anthropic.com/engineering/claude-code-permissions                                                                                                                                                                                            |
| A10 | Code execution with MCP: Building more efficient agents (2026)                      | https://www.anthropic.com/engineering/code-execution-with-mcp                                                                                                                                                                                            |
| A11 | Claude Code docs (best practices)                                                   | https://code.claude.com/docs/en/best-practices                                                                                                                                                                                                           |
| A12 | Anthropic Cookbook — agent patterns                                                 | https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents                                                                                                                                                                               |
| A13 | The "think" tool (Mar 2025)                                                         | https://www.anthropic.com/engineering/claude-think-tool                                                                                                                                                                                                  |
| A14 | Desktop Extensions / DXT one-click MCP install (Jun 2025)                           | https://www.anthropic.com/engineering/desktop-extensions                                                                                                                                                                                                 |

### 1.2 OpenAI — Codex CLI and Codex MCP

| #   | Title                                                                                                                            | URL                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1  | Codex documentation index                                                                                                        | https://developers.openai.com/codex                      |
| C2  | Codex CLI overview                                                                                                               | https://developers.openai.com/codex/cli                  |
| C3  | Codex Best Practices                                                                                                             | https://developers.openai.com/codex/learn/best-practices |
| C4  | Custom instructions with AGENTS.md (precedence, `AGENTS.override.md`, `project_doc_fallback_filenames`, `project_doc_max_bytes`) | https://developers.openai.com/codex/guides/agents-md     |
| C5  | Configuration Reference                                                                                                          | https://developers.openai.com/codex/config-reference     |
| C6  | Advanced Configuration                                                                                                           | https://developers.openai.com/codex/config-advanced      |
| C7  | CLI command line options                                                                                                         | https://developers.openai.com/codex/cli/reference        |
| C8  | Codex Features (subagents, image attach, slash commands, MCP)                                                                    | https://developers.openai.com/codex/cli/features         |
| C9  | Codex Subagents (`[agents]` config; `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`)                    | https://developers.openai.com/codex/subagents            |
| C10 | Codex MCP integration                                                                                                            | https://developers.openai.com/codex/mcp                  |
| C11 | Codex Skills (separate primitive from AGENTS.md)                                                                                 | https://developers.openai.com/codex/skills               |
| C12 | Codex Rules                                                                                                                      | https://developers.openai.com/codex/rules                |
| C13 | Codex Hooks (`hooks.json` lifecycle hooks)                                                                                       | https://developers.openai.com/codex/hooks                |
| C14 | Codex Plugins                                                                                                                    | https://developers.openai.com/codex/plugins              |
| C15 | Codex Security / sandbox policy / trusted vs. untrusted projects                                                                 | https://developers.openai.com/codex/security             |
| C16 | Codex SDK                                                                                                                        | https://developers.openai.com/codex/sdk                  |
| C17 | Codex App Server                                                                                                                 | https://developers.openai.com/codex/app-server           |
| C18 | Codex MCP Server (run Codex itself as MCP)                                                                                       | https://developers.openai.com/codex/mcp-server           |
| C19 | Codex GitHub Action                                                                                                              | https://developers.openai.com/codex/github-action        |
| C20 | Using Codex with the OpenAI Agents SDK (multi-agent cookbook)                                                                    | https://developers.openai.com/codex/guides/agents-sdk    |
| C21 | `openai/codex` repo's own `AGENTS.md` (canonical example)                                                                        | https://github.com/openai/codex/blob/main/AGENTS.md      |

### 1.3 Google — Gemini CLI and Gemini Code Assist

| #   | Title                                                                                                       | URL                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G1  | Provide context with GEMINI.md files (filename configurable via `context.fileName` in `settings.json`)      | https://geminicli.com/docs/cli/gemini-md/                                              |
| G2  | Subagents have arrived in Gemini CLI (parallel subagents, `.gemini/agents/<name>.md` with YAML frontmatter) | https://developers.googleblog.com/subagents-have-arrived-in-gemini-cli/                |
| G3  | Gemini CLI extension best practices                                                                         | https://geminicli.com/docs/extensions/best-practices/                                  |
| G4  | Gemini Code Assist agent mode (`GEMINI.md` or `AGENT.md` at project root)                                   | https://developers.google.com/gemini-code-assist/docs/use-agentic-chat-pair-programmer |
| G5  | Gemini CLI discussion #1471 — AGENTS.md compatibility                                                       | https://github.com/google-gemini/gemini-cli/discussions/1471                           |
| G6  | `google-gemini/gemini-cli` source repo                                                                      | https://github.com/google-gemini/gemini-cli                                            |

### 1.4 OpenCode

| #   | Title                                                                                                                          | URL                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| O1  | OpenCode rules (AGENTS.md at project root, `~/.config/opencode/AGENTS.md` global, CLAUDE.md fallback for Claude Code migrants) | https://opencode.ai/docs/rules/  |
| O2  | OpenCode agents (markdown agents in `.opencode/agents/`)                                                                       | https://opencode.ai/docs/agents/ |
| O3  | OpenCode docs index                                                                                                            | https://opencode.ai/docs/        |
| O4  | OpenCode config schema (`opencode.json` with `instructions` field, `permission` field)                                         | https://opencode.ai/config.json  |

### 1.5 Cross-vendor standards

| #   | Title                                                               | URL                                                                          |
| --- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| X1  | AGENTS.md open spec — Agentic AI Foundation under Linux Foundation  | https://agents.md/                                                           |
| X2  | Model Context Protocol specification (latest 2025-11-25)            | https://modelcontextprotocol.io/specification/2025-11-25                     |
| X3  | MCP repo (specification + SDKs)                                     | https://github.com/modelcontextprotocol/modelcontextprotocol                 |
| X4  | MCP blog — One Year of MCP (Nov 2025 spec release; AAIF transition) | https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/ |
| X5  | Agentic AI Foundation (AAIF) at the Linux Foundation                | https://agentic.foundation/                                                  |

### 1.6 Other relevant harnesses (already cited in `AGENTS.md`)

| #   | Title                                                                                                                                         | URL                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| H1  | Cursor Rules (Project / Team / User Rules; AGENTS.md supported; `.cursor/rules/*.mdc` frontmatter with `description`, `globs`, `alwaysApply`) | https://cursor.com/docs/context/rules                       |
| H2  | Aider Conventions (`CONVENTIONS.md` via `aider --read` or `read:` in `.aider.conf.yml`; community recommends AGENTS.md per issue #4363)       | https://aider.chat/docs/usage/conventions.html              |
| H3  | Aider community conventions repo                                                                                                              | https://github.com/Aider-AI/conventions                     |
| H4  | Continue.dev config.yaml reference (`rules`, `prompts`, `mcpServers`, `context`)                                                              | https://docs.continue.dev/reference                         |
| H5  | Continue.dev rules deep dive (`.continue/rules/*.md` with `globs`, `regex`, `alwaysApply`, `description`)                                     | https://docs.continue.dev/customize/deep-dives/rules        |
| H6  | Sourcegraph Amp Owner's Manual (AGENTS.md / AGENT.md, subagents, threads, oracle)                                                             | https://ampcode.com/manual                                  |
| H7  | Amp examples & guides repo (incl. Context Engineering deep dive)                                                                              | https://github.com/sourcegraph/amp-examples-and-guides      |
| H8  | Cline (and Roo Code fork) — uses `.clinerules` and `.clinerules/` folder                                                                      | https://docs.cline.bot/features/cline-rules                 |
| H9  | Goose (Block) — uses `goosehints`                                                                                                             | https://block.github.io/goose/docs/guides/using-goosehints/ |

---

## §2 The Anthropic exam guide in five lines

Five domains, percentages indicate scored weight:

1. **Agentic Architecture & Orchestration** (27%) — agentic loops, coordinator-subagent
   patterns, programmatic enforcement, hooks for tool-call interception, dynamic
   task decomposition, session resumption and forking.
2. **Tool Design & MCP Integration** (18%) — tool description quality, structured
   error responses (`errorCategory`, `isRetryable`), tool-set distribution per
   agent, `tool_choice` configuration, MCP server scoping (project vs. user),
   built-in tool selection.
3. **Claude Code Configuration & Workflows** (20%) — CLAUDE.md hierarchy + @imports,
   slash commands, Agent Skills (with `context: fork`, `allowed-tools`,
   `argument-hint`), path-scoped rules with glob frontmatter, plan vs. direct
   execution, iterative refinement (test-driven, interview pattern), CI/CD
   integration via `-p` and `--output-format json`.
4. **Prompt Engineering & Structured Output** (20%) — explicit review criteria
   over vague heuristics, few-shot examples for ambiguous cases, `tool_use`
   with JSON schemas, nullable fields to prevent hallucination, validation-retry
   loops, Message Batches API for latency-tolerant workloads, multi-instance
   review architectures.
5. **Context Management & Reliability** (15%) — case-facts persistence vs.
   progressive summarization, "lost in the middle," verbose tool-output
   trimming, escalation criteria, structured error propagation, scratchpads
   for long-horizon work, confidence calibration with stratified sampling,
   source attribution and conflict annotation in multi-source synthesis.

---

## §3 Cross-vendor primitives — how each harness implements the same concept

This is the lookup table the reviewing agent should consult when deciding
**which** vendor doc is authoritative for **which** part of the audit.

| Primitive               | Claude Code                                                                                         | Codex                                                                                                                   | Gemini CLI                                                               | OpenCode                                                                                 | Cursor                                                                              | Aider                                                        | Continue                                                                 | Amp                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Project rules file      | `CLAUDE.md` (+ `.claude/rules/*.md` w/ YAML glob frontmatter)                                       | `AGENTS.md` + `AGENTS.override.md` per dir; precedence: global → root → cwd                                             | `GEMINI.md` (or any name listed in `context.fileName` incl. `AGENTS.md`) | `AGENTS.md` (falls back to `CLAUDE.md` for migrants)                                     | `.cursor/rules/*.mdc` w/ `description`/`globs`/`alwaysApply`; `AGENTS.md` supported | `CONVENTIONS.md` via `--read` / `read:` in `.aider.conf.yml` | `.continue/rules/*.md` w/ `globs`, `regex`, `alwaysApply`, `description` | `AGENT.md` / `AGENTS.md`; nested files merged               |
| User-level rules        | `~/.claude/CLAUDE.md`                                                                               | `~/.codex/AGENTS.md` (or `AGENTS.override.md`)                                                                          | `~/.gemini/GEMINI.md`                                                    | `~/.config/opencode/AGENTS.md`                                                           | Cursor Settings → User Rules                                                        | `.aider.conf.yml` in `$HOME`                                 | `~/.continue/config.yaml`                                                | `~/.config/AGENT.md`                                        |
| Sub-agent definition    | `.claude/agents/<name>.md` (frontmatter: `name`, `description`, `tools`, `model`)                   | `[agents]` block in `~/.codex/config.toml` + `spawn_agent`/`send_input`/`resume_agent`/`wait_agent`/`close_agent` tools | `.gemini/agents/<name>.md` w/ YAML frontmatter (parallel supported)      | `.opencode/agents/<name>.md`                                                             | n/a (chat modes only)                                                               | n/a                                                          | Per-config in `config.yaml`                                              | "Spawn a subagent" prompted; no formal config               |
| Skills                  | `.claude/skills/<name>/SKILL.md` w/ frontmatter (`context: fork`, `allowed-tools`, `argument-hint`) | Codex Skills (separate from AGENTS.md; same SKILL.md spec)                                                              | n/a (use commands + extensions)                                          | Skills supported; falls back to `~/.claude/skills/` for migrants                         | n/a                                                                                 | n/a                                                          | Hub prompts                                                              | n/a                                                         |
| Slash commands          | `.claude/commands/<name>.md`                                                                        | `.codex/commands/<name>.md`                                                                                             | `.gemini/commands/<name>.toml` (TOML)                                    | `.opencode/commands/<name>.md`                                                           | `.cursor/commands/<name>.mdc`                                                       | In-chat `/` commands hard-coded                              | `prompts:` in `config.yaml`                                              | `.agents/commands/<name>.md`                                |
| Hooks                   | PostToolUse, PreToolUse hooks (Agent SDK)                                                           | `hooks.json` lifecycle hooks (toggleable via `experimental.hooks`)                                                      | n/a (use MCP)                                                            | Custom commands                                                                          | n/a                                                                                 | `lint-cmd`, `test-cmd` in `.aider.conf.yml`                  | n/a (use MCP)                                                            | Plugins ("hook into events, add tools, standardize policy") |
| Permission / sandbox    | `allowedTools` per-tool; permission prompts                                                         | `sandbox_mode` = `workspace-write` / `on-request` / `never`; trusted/untrusted projects                                 | Approval prompts per-tool                                                | `permission.edit`/`permission.bash`/`permission.skill` w/ glob patterns + allow/ask/deny | Default ask                                                                         | `--dangerously-allow-all` not present; manual `/add`/`/read` | Per-tool consent dialogs                                                 | `--dangerously-allow-all` flag for CI                       |
| MCP config              | Project: `.mcp.json`; user: `~/.claude.json`; env-var expansion `${...}`                            | `~/.codex/config.toml` `[mcp_servers]` (STDIO + streaming HTTP); `codex mcp` CLI; can run Codex itself as MCP server    | Per `settings.json`                                                      | `opencode.json` `mcp` block                                                              | `.cursor/mcp.json`                                                                  | n/a (community wrappers)                                     | `mcpServers:` in `config.yaml`                                           | `amp.mcpServers` in settings                                |
| Non-interactive CI mode | `claude -p "…"` w/ `--output-format json --json-schema …`                                           | `codex exec "…"` + `--ask-for-approval never`                                                                           | n/a (interactive only)                                                   | n/a                                                                                      | n/a                                                                                 | `aider --message "…" --yes`                                  | Per-config                                                               | `amp -x "…"` (+ `--dangerously-allow-all`)                  |

---

## §4 Domain-by-domain alignment matrix

Cells: ✅ implemented · 🟡 partial · ❌ gap · n/a not applicable. **Bold** cells
have a corresponding gap-analysis task in §6.

| Exam domain (Anthropic)                                           | Claude Code patterns in `nexus-agents`                                                        | Codex patterns                                                         | Gemini patterns                          | OpenCode patterns                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| **D1.1 Agentic loop / `stop_reason` discipline**                  | ✅ Orchestrator (`src/orchestration/`)                                                        | 🟡 `codex` adapter passes through                                      | n/a (Gemini handles internally)          | 🟡                                              |
| **D1.2 Coordinator-subagent topology**                            | ✅ 12 experts + `Orchestrator`; `consensus_vote` panel                                        | 🟡 Codex has `max_thread_depth`=1 default — **doc gap**                | ✅ via parallel subagents                | 🟡                                              |
| **D1.3 Subagent context-passing**                                 | ✅ `agents/<name>-expert.md`                                                                  | 🟡 — **doc gap**                                                       | ✅                                       | 🟡                                              |
| **D1.4 Programmatic enforcement (prerequisite gates)**            | 🟡 `governance:check` + voter panel — but **no MCP-tool-level pre-call gate**; see §6 T1      | 🟡 Codex `hooks.json` available but not exploited                      | n/a                                      | 🟡 `permission` field is the analog — see §6 T7 |
| **D1.5 PostToolUse / pre-call hooks for normalization**           | ❌ — see §6 T2                                                                                | 🟡 (config exists, unused)                                             | n/a                                      | n/a                                             |
| **D1.6 Dynamic task decomposition**                               | ✅ `SharedTaskAnalyzer`                                                                       | 🟡                                                                     | ✅                                       | 🟡                                              |
| **D1.7 `fork_session` for divergent exploration**                 | ❌ — see §6 T3                                                                                | 🟡 `codex fork` subcommand exists; not wired                           | n/a                                      | n/a                                             |
| **D2.1 Tool description quality / disambiguation**                | 🟡 38 MCP tools, **no automated distinctness lint** — see §6 T4                               | 🟡                                                                     | 🟡                                       | 🟡                                              |
| **D2.2 Structured error envelope**                                | ❌ — see §6 T5                                                                                | ❌                                                                     | ❌                                       | ❌                                              |
| **D2.3 Tool distribution per agent / `tool_choice`**              | ✅ adapter scoping; voter `allowed-tools`                                                     | 🟡                                                                     | ✅                                       | ✅                                              |
| **D2.4 MCP server scoping (project vs. user)**                    | ✅ `.mcp.json.example`                                                                        | ✅ Codex distinction documented; **adapter notes missing** — see §6 T8 | ✅                                       | ✅                                              |
| **D2.5 Built-in tool selection (Read/Write/Edit/Bash/Grep/Glob)** | ✅ adapters expose                                                                            | ✅                                                                     | ✅                                       | ✅                                              |
| **D3.1 CLAUDE.md hierarchy + @import**                            | ✅ `CLAUDE.md` + `AGENTS.md`                                                                  | 🟡 Codex precedence stricter — see §6 T6                               | 🟡 `context.fileName` config — see §6 T6 | 🟡 fallback chain — see §6 T6                   |
| **D3.2 Custom slash commands + skills**                           | ✅ `.claude/commands/`, `skills/` w/ `index.yaml`                                             | 🟡 Codex Skills mirror needed — see §6 T9                              | 🟡 TOML format                           | ✅                                              |
| **D3.3 Path-scoped rules w/ glob frontmatter**                    | 🟡 `.rules/*.md` use **content keywords, not glob frontmatter** — see §6 T10                  | n/a                                                                    | n/a                                      | n/a                                             |
| **D3.4 Plan mode vs. direct execution**                           | n/a (governance, not coding)                                                                  | n/a                                                                    | n/a                                      | n/a                                             |
| **D3.5 Iterative refinement (interview pattern)**                 | 🟡 voter panel already does this                                                              | n/a                                                                    | n/a                                      | n/a                                             |
| **D3.6 CI/CD integration**                                        | ✅ blocking governance check                                                                  | ✅ adapter supports `-p`-equivalent                                    | n/a                                      | n/a                                             |
| **D4.1 Explicit criteria over heuristics**                        | ✅ `pr_review` voter rubric                                                                   | ✅                                                                     | ✅                                       | ✅                                              |
| **D4.2 Few-shot prompting for ambiguity**                         | 🟡 in expert prompts; not formalized as a rule                                                | n/a                                                                    | n/a                                      | n/a                                             |
| **D4.3 `tool_use` + JSON schema for structured output**           | ✅ Zod boundaries                                                                             | ✅                                                                     | ✅                                       | ✅                                              |
| **D4.4 Validation-retry loops**                                   | ✅ improvement_review loop                                                                    | ✅                                                                     | ✅                                       | ✅                                              |
| **D4.5 Batch API for latency-tolerant workloads**                 | ❌ — see §6 T11                                                                               | ❌ (analog: OpenAI batch endpoint)                                     | ❌                                       | ❌                                              |
| **D4.6 Multi-instance / multi-pass review**                       | ✅ adversarial PR review                                                                      | ✅ "Writer/Reviewer" pattern from A3                                   | ✅                                       | ✅                                              |
| **D5.1 Case-facts persistence / context layers**                  | ✅ `OutcomeStore`                                                                             | ✅                                                                     | ✅                                       | ✅                                              |
| **D5.2 Escalation criteria / typed actions**                      | ✅ `.rules/untrusted-input.md` typed actions                                                  | n/a                                                                    | n/a                                      | n/a                                             |
| **D5.3 Structured error propagation across agents**               | 🟡 audit trail logs, but **error envelope not structured per D2.2** — see §6 T5               | 🟡                                                                     | 🟡                                       | 🟡                                              |
| **D5.4 Scratchpads / state persistence for long horizons**        | ✅ `query_task_state`, `AuditTrail` hash chain                                                | ✅ via threads                                                         | ✅ via memory                            | ✅ via threads                                  |
| **D5.5 Confidence calibration / stratified sampling**             | 🟡 fitness audit exists; not stratified — see §6 T12                                          | n/a                                                                    | n/a                                      | n/a                                             |
| **D5.6 Source provenance in synthesis**                           | ✅ `research_synthesize` cites; **need verification across all synthesis paths** — see §6 T13 | ✅                                                                     | ✅                                       | ✅                                              |

---

## §5 Strengths to preserve (do not regress)

The audit should explicitly **call out** these as load-bearing strengths, so
later refactors don't accidentally remove them:

- **Drift-detected charter** with blocking CI gates — directly implements
  D1.4's "programmatic enforcement" principle at the project level rather
  than runtime.
- **Hash-chained audit trail** with `verify_audit_chain` — exceeds D5.4's
  "structured state persistence for crash recovery."
- **Closed-loop telemetry** via `OutcomeStore` + LinUCB + TOPSIS —
  the exam guide doesn't even prescribe this; it's load-bearing for the
  governance value prop.
- **Untrusted-input invariants** (Rule of Two, typed actions, Tier 1
  source citation, fail-closed) — directly implements D5.2 escalation
  criteria _and_ is meaningfully stricter than any vendor's defaults.
- **Adversarial PR review with 4-point gate** — the multi-voter +
  scope-steward + catfish setup is a real implementation of D4.6
  multi-instance review.

Tasks in §6 should not require changes to these systems; they're the
backbone the gaps need to plug into.

---

## §6 Gap analysis tasks

Each task: scope (files/paths) · acceptance criterion (verifiable) · voter
roles (from `agents/index.yaml`) · consensus strategy (from
`.rules/governance.md`). Tasks marked ⚖️ require `consensus_vote`. Tasks
without that mark can ship via `pr_review`.

### T1 — Programmatic prerequisite gates for sensitive MCP tools ⚖️

**Scope:** `src/mcp/tools/index.ts`, all tools in `src/mcp/tools/*.ts` that
touch outcome data, audit storage, governance state, or external systems.
**Hypothesis:** Some tools that mutate state or escalate trust can currently
be called without verifying upstream prerequisites (cf. A1 D1.4, sample Q1).
**Task:** Catalogue every MCP tool that (a) mutates persistent state,
(b) emits an audit-trail entry, or (c) acts on untrusted input. For each,
identify the prerequisite tools (e.g., `verify_audit_chain` before
`improvement_review` on prior outcomes; trust-tier classification before
any `issue_triage` write). Propose a hook-based or wrapper-based gate that
**blocks** rather than warns.
**Acceptance:** Draft of `.rules/tool-prerequisites.md` enumerating the
prerequisite graph; matching CI lint that fails if a guarded tool is exposed
without its gate wired.
**Voter roles:** `architecture`, `security`, `scope_steward`.
**Consensus:** `supermajority` × `higher_order` (architecture change).

### T2 — PostToolUse normalization hooks

**Scope:** `hooks/`, `src/cli-adapters/*`, anywhere MCP tool outputs are
consumed by downstream experts.
**Hypothesis:** Heterogeneous formats (Unix timestamps vs. ISO 8601;
varying status taxonomies; differing pagination shapes) currently leak
into expert prompts and consensus_vote payloads, where they degrade
voter calibration (cf. A1 D1.5; A5 §"Return meaningful context").
**Task:** Survey tool outputs that flow into voter panels and the
`AuditTrail`. Identify normalization candidates (timestamps → ISO 8601,
status codes → enum strings, pagination → consistent envelope). Specify
a hook layer (`hooks/post-tool-use/normalize.ts`) that mutates tool
results before they're appended to context.
**Acceptance:** Hook stub with a test fixture demonstrating normalization
of three real heterogeneous outputs; rule added to `.rules/hooks.md`
(create if missing) documenting when to reach for a normalization hook
vs. a voter rule vs. a prompt rule.
**Voter roles:** `architecture`, `devex`, `ai_ml`.
**Consensus:** `majority` × `simple_majority` (additive, non-breaking).

### T3 — Explicit `fork_session` / branch-comparison semantics

**Scope:** `src/orchestration/graph/graph-builder.ts`, `src/consensus/engine.ts`.
**Hypothesis:** `supply_chain_tradeoff_panel` and `consensus_vote` would
benefit from explicit forked-baseline semantics: from a shared analysis,
evaluate divergent options without re-running discovery (cf. A1 D1.7).
**Task:** Determine whether the existing graph-builder + outcome store
can express "fork from this analysis baseline → run N divergent
branches → merge findings" without changes; if yes, document the
pattern in `.rules/forking.md`. If no, design the additions.
**Acceptance:** A runnable example in `docs/research/fork-session-example.md`
showing the same analysis baseline producing two competing PR plans
through divergent voter panels.
**Voter roles:** `architecture`, `ai_ml`, `pm`.
**Consensus:** `majority` × `simple_majority`.

### T4 — Tool-description distinctness lint ⚖️

**Scope:** `src/mcp/tools/*.ts` (all 38 tools).
**Hypothesis:** With 38 tools, some descriptions are insufficiently
distinct, causing routing misses (cf. A1 D2.1 sample Q2; A5 §"namespacing").
**Task:** Build a check in `scripts/generate-mcp-tool-index.ts` (or
adjacent) that computes pairwise textual similarity (TF-IDF or embedding-
based) of tool descriptions, flags pairs over a threshold, and exits
non-zero. Run the check on current `main`; file a follow-up issue per
flagged pair with proposed renames or boundary clarifications.
**Acceptance:** Lint added to `governance:check`; report of flagged
pairs committed to `docs/research/mcp-tool-distinctness-v1.md`.
**Voter roles:** `architecture`, `devex`, `ai_ml`, `scope_steward`.
**Consensus:** `supermajority` × `higher_order` (touches every tool).

### T5 — Structured MCP error envelope ⚖️

**Scope:** `src/mcp/tools/*.ts`, `src/security/index.ts`, `.rules/mcp.md`.
**Hypothesis:** Tool failures currently leak generic strings or stack
traces; the exam guide A1 D2.2 and A5 prescribe a structured envelope
with `errorCategory` (`transient` / `validation` / `permission` /
`business`), `isRetryable: boolean`, and a customer-readable description.
This generalizes across Claude, Codex, Gemini, and OpenCode because none
of them have something stricter.
**Task:** Specify the envelope as a Zod schema. Migrate every MCP tool
that currently returns `isError: true` to use the envelope. Document
the contract in `.rules/mcp.md` and require it via a CI gate.
**Acceptance:** Schema in `src/mcp/error-envelope.ts`; all 38 tools
migrated; CI gate added; `.rules/mcp.md` updated.
**Voter roles:** `architecture`, `security`, `devex`, `ai_ml`,
`scope_steward`.
**Consensus:** `supermajority` × `higher_order` (API-shape change).

### T6 — Per-adapter rule-precedence documentation

**Scope:** `docs/guides/`, `.rules/`, `AGENTS.md`.
**Hypothesis:** Codex resolves `AGENTS.override.md` → `AGENTS.md` →
`project_doc_fallback_filenames` strictly in precedence order at every
directory along the project-root-to-cwd path (C4). Gemini uses
`context.fileName` as an ordered list in `settings.json` (G1). OpenCode
falls back to `CLAUDE.md` and `~/.claude/skills/` (O1). Claude Code
autoloads `.rules/*.md` by keyword match. **These four behaviors diverge
in ways that affect whether `.rules/` files actually load.**
**Task:** Create `docs/guides/RULE_PRECEDENCE.md` documenting exactly
what each adapter loads, from where, and in what order. Cross-reference
from `AGENTS.md`. Where `nexus-agents` makes assumptions that hold for
one adapter but not others, file follow-up issues.
**Acceptance:** Doc committed; `AGENTS.md` updated with a one-paragraph
"For Codex/Gemini/OpenCode users, see…" reference.
**Voter roles:** `documentation`, `devex`, `architecture`.
**Consensus:** `majority` × `simple_majority`.

### T7 — OpenCode permission-system parity

**Scope:** `src/cli-adapters/opencode-*`, `.rules/security.md`.
**Hypothesis:** OpenCode's `permission.edit` / `permission.bash` /
`permission.skill` with allow/ask/deny + glob patterns (O1, O4) is the
deterministic-enforcement primitive most analogous to Codex's
`sandbox_mode` and Claude Code's `allowedTools`. The opencode adapter
should map to it explicitly rather than relying on opencode's defaults.
**Task:** Inventory the tools that `nexus-agents` invokes through the
opencode adapter. Specify a default `permission` block to emit alongside
`opencode.json` when `nexus-agents init --portable` runs against an
opencode-using workspace.
**Acceptance:** `Dockerfile.opencode` and the `opencode` adapter both
honor the permission block; `.rules/security.md` references it.
**Voter roles:** `security`, `devex`.
**Consensus:** `supermajority` × `higher_order` (security-related).

### T8 — Codex `max_thread_depth` + concurrent-thread documentation

**Scope:** `src/cli-adapters/codex-*`, `src/cli-adapters/composite-router.ts`.
**Hypothesis:** Codex defaults to `max_thread_depth = 1` and 6 concurrent
threads (C5). The `nexus-agents` coordinator-subagent topology can exceed
these defaults in deep `consensus_vote` panels, silently degrading the
codex adapter's behavior.
**Task:** Document the defaults, detect when a task plan exceeds them at
routing time, and either (a) auto-flatten the topology for codex, (b)
raise `max_thread_depth` in the spawned `~/.codex/config.toml`, or (c)
emit a clear runtime warning. Pick one and implement it.
**Acceptance:** Logic added to `composite-router.ts` or codex adapter
factory; new entry in `.rules/subagent-coordination.md` calling out
the Codex-specific limit.
**Voter roles:** `architecture`, `devex`, `ai_ml`.
**Consensus:** `majority` × `simple_majority`.

### T9 — Codex Skills cross-publishing of `skills/`

**Scope:** `skills/`, `skills/index.yaml`, `scripts/generate-skills-index.ts`.
**Hypothesis:** Anthropic's Agent Skills spec is shared across Claude Code
and Codex (C11). The 31 skills in `skills/` should be loadable in Codex
sessions too, but the index generator may emit Claude-only metadata.
**Task:** Verify each `skills/<name>/SKILL.md` frontmatter is conformant
to both the Anthropic skill spec (A8) and Codex's Skills primitive.
Cross-publish `skills/index.yaml` references for Codex's discovery
mechanism. Add a CI check for cross-vendor frontmatter validity.
**Acceptance:** All 31 skills loadable from a Codex session in a smoke
test fixture; CI check added.
**Voter roles:** `documentation`, `devex`, `ai_ml`.
**Consensus:** `majority` × `simple_majority`.

### T10 — Glob-pattern frontmatter in `.rules/*.md`

**Scope:** All `.rules/*.md`, `scripts/` (rule-loading helpers).
**Hypothesis:** The current `.rules/*.md` system relies on Claude Code's
keyword-matched autoload. Codex (which uses `AGENTS.md` precedence rather
than keyword autoload), Gemini (which uses `context.fileName` lists),
and OpenCode (`AGENTS.md` + fallback) won't trigger these correctly. The
exam guide's D3.3 prescribes `paths:` glob frontmatter as the more
deterministic primitive.
**Task:** Add YAML frontmatter `paths:` (list of globs) to each rule
file. Update the rule-loader to honor it across all adapters. Ensure
the loader **degrades cleanly** in Claude Code (which still autoloads
on keyword match).
**Acceptance:** Frontmatter added to every `.rules/*.md`; adapter-level
loader honors it; test fixture demonstrating that
`.rules/typescript.md` (with `paths: ["**/*.ts", "**/*.tsx"]`) loads
when editing a `.ts` file across all four adapters.
**Voter roles:** `architecture`, `devex`.
**Consensus:** `majority` × `simple_majority`.

### T11 — Message Batches API mode for latency-tolerant workloads ⚖️

**Scope:** `src/pipeline/pipeline-runner.ts`, the `improvement_review`,
`research_discover`, `research_analyze`, `vendor_publishing_audit`, and
`supply_chain_tradeoff_panel` tools.
**Hypothesis:** A1 D4.5 prescribes the Message Batches API for nightly /
weekly / non-blocking workloads (50% cost savings, ≤24h SLA). All of
the above tools are textbook batch workloads. OpenAI has an analogous
batch endpoint that the codex/codex-mcp adapter can target.
**Task:** Add a `batch: boolean` flag to the relevant pipeline runners.
When `true`: submit through the Anthropic Batches endpoint (for the claude
adapter) or OpenAI batch endpoint (for codex). Correlate results via
`custom_id`. Document SLA-window math (e.g., 4-hour submission cadence
to guarantee a 30-hour SLA with 24-hour batch processing).
**Acceptance:** `batch: true` end-to-end in `improvement_review`;
documented in `docs/architecture/BATCH_MODE.md`.
**Voter roles:** `architecture`, `devex`, `pm`, `scope_steward`.
**Consensus:** `supermajority` × `higher_order` (cost / SLA implications).

### T12 — Stratified sampling in fitness audit

**Scope:** `nexus-agents fitness-audit`, `src/pipeline/pipeline-runner.ts`.
**Hypothesis:** Aggregate fitness scores may hide poor performance on
specific document types, voter-role combinations, or adapter pairs (A1
D5.5).
**Task:** Add stratification dimensions to `fitness-audit`: at minimum
{adapter, voter-role, task-type}. Output per-stratum accuracy rates.
Surface novel-error patterns separately.
**Acceptance:** New stratified report under
`docs/research/fitness-stratified-v1.md`; CI artifact attached weekly.
**Voter roles:** `architecture`, `ai_ml`, `qa`.
**Consensus:** `majority` × `simple_majority`.

### T13 — Source provenance audit in research synthesis

**Scope:** `research_synthesize`, `research_catalog_review`,
`pr_review` (where it summarizes prior findings).
**Hypothesis:** Some synthesis paths may drop claim-source mappings
during summarization (A1 D5.6). The risk is highest where multiple
sources are merged into a single voter-facing prompt.
**Task:** Trace every synthesis path. Assert that each merged claim
carries `{claim, evidence_excerpt, source_uri, publication_date}` from
ingestion through final output. Add unit tests demonstrating that
contradicting sources are annotated rather than silently chosen between.
**Acceptance:** Tests in `testing/` covering at least the three highest-
volume synthesis paths; rule entry added to `.rules/research.md` (create
if missing).
**Voter roles:** `research`, `ai_ml`, `documentation`.
**Consensus:** `majority` × `simple_majority`.

### T14 — Tool annotation conformance (MCP 2025-11-25)

**Scope:** `src/mcp/tools/*.ts`.
**Hypothesis:** The 2025-11-25 MCP spec (X2, X4) introduced richer tool
annotations (`readOnly`, `destructive`, `idempotent`, `outOfBand`). The
38 tools should declare these explicitly; this directly aids T1's
prerequisite-gate work and T4's distinctness lint.
**Task:** Audit each tool's annotation declaration. Where missing,
add. Where present, verify accuracy. Add a CI check that fails on
missing annotations.
**Acceptance:** All 38 tools annotated; CI check added; results doc
notes which tools changed annotation.
**Voter roles:** `architecture`, `security`, `devex`.
**Consensus:** `majority` × `simple_majority`.

---

## §7 Optional `governance:check` / CI additions

The following are net-new checks that codify the gap-analysis work as
permanent guardrails:

- **`check:mcp-error-envelope`** — every tool exports the structured
  error envelope (T5). Fails build if not.
- **`check:tool-distinctness`** — pairwise tool-description similarity
  threshold (T4). Fails build above threshold.
- **`check:tool-annotations`** — every tool declares MCP 2025-11-25
  annotations (T14).
- **`check:rule-frontmatter`** — every `.rules/*.md` has
  `paths:` and `description:` frontmatter (T10).
- **`check:skill-cross-vendor`** — every `SKILL.md` frontmatter valid
  per both Anthropic and Codex specs (T9).
- **`check:adapter-precedence-docs`** — `docs/guides/RULE_PRECEDENCE.md`
  exists and lists all four adapters (T6).
- **`check:tool-prerequisites`** — `.rules/tool-prerequisites.md`
  enumerates the prerequisite graph and matches what code wires (T1).

All checks run in `inject-governance.ts check` so existing CI
infrastructure picks them up.

---

## §8 Results-document skeleton

Create `docs/research/multi-harness-alignment-results-v1.md` with:

```markdown
# Multi-Harness Alignment Audit — Results v1

**Run date:** YYYY-MM-DD
**Commit:** <sha>
**Adapters tested:** claude, codex, codex-mcp, gemini, opencode
**Auditing model(s):** <which models ran each task>

## Executive summary

3-5 sentences. Lead with the biggest finding.

## Per-task findings

### T1 — Prerequisite gates

- Status: PASS / PARTIAL / FAIL
- Voter outcome: <consensus_vote result>
- Evidence: <file paths, log excerpts>
- Follow-up issues filed: #NNNN, #NNNN

[Repeat for T2–T14]

## Strengths reaffirmed

- <one bullet per §5 entry that the audit verified>

## Drift detected

- <anything that surprised the auditor and isn't covered by an existing rule>

## Cross-vendor specific

- Claude Code: <vendor-specific findings>
- Codex: <…>
- Gemini: <…>
- OpenCode: <…>

## Next-version backlog

- <numbered list of work to defer to v2, each with a tracking issue>
```

Format mirrors `pr-review-experiment-results-v5.md` to keep the corpus
consistent.

---

## §9 Slash-command scaffold

Drop into `.claude/commands/multi-harness-audit.md` so the audit becomes
`/multi-harness-audit` in Claude Code, and into `.codex/commands/` for Codex:

```markdown
---
description: Run the multi-harness alignment audit (see docs/research/multi-harness-alignment-audit.md)
argument-hint: [task-id|all]
allowed-tools: Read, Grep, Glob, Bash, Task
---

Run the multi-harness alignment audit against the current commit.

If $ARGUMENTS is "all", run tasks T1–T14 sequentially via pr_review for
non-⚖️ tasks and consensus_vote for ⚖️ tasks.

If $ARGUMENTS is a specific task ID (e.g., "T5"), run only that task.

Acceptance criteria for each task are in
docs/research/multi-harness-alignment-audit.md §6.

Output findings into docs/research/multi-harness-alignment-results-v1.md
using the skeleton in §8.

Track all deferred follow-ups as GitHub issues with the
"multi-harness-audit" label (see AGENTS.md "Track all work" rule).
```

---

## §10 Prompt prologue (paste into `claude` or `nexus-agents orchestrate`)

```
You are running the Nexus-Agents Multi-Harness Alignment Audit defined in
docs/research/multi-harness-alignment-audit.md.

Pre-flight (§0):
1. Verify access to every URL in §1 of that document. Note unreachables
   in the results doc; do not fabricate.
2. Confirm canonical paths from AGENTS.md exist.
3. Load .rules/mcp.md, .rules/governance.md, .rules/subagent-coordination.md,
   .rules/untrusted-input.md, .rules/security.md.
4. Run `nexus-agents governance:check`. If drift fails, stop and fix drift
   first.

Audit execution (§6):
- Run tasks T1–T14 in numeric order.
- For each non-⚖️ task: use `pr_review` against a draft PR that contains
  your proposed changes for that task.
- For each ⚖️ task: use `consensus_vote` with the strategy specified in
  the task body. Honor the strictest applicable threshold from
  .rules/governance.md (unanimous > supermajority > majority).
- Track every deferred follow-up as a GitHub issue per AGENTS.md
  "Track all work — deferring is fine, untracked is not."

Output (§8):
- Write to docs/research/multi-harness-alignment-results-v1.md using the
  skeleton from §8. One section per task.

Constraints:
- Do not regress any §5 strength.
- Do not invent vendor behavior. If a vendor doc doesn't say something,
  state that and either web_fetch the source or file a documentation
  follow-up.
- Quotes from any source must be under 15 words; paraphrase everything
  else.
- The Anthropic exam guide (A1) is NTK-marked. Reference it by section
  number; do not reproduce its text verbatim.
- Stop and ask the operator if any task's scope expands beyond
  ~500 lines of changes or touches src/security/index.ts non-trivially.
```

---

## §11 Suggested next-step deliverables

If §6 ships cleanly, the natural follow-ons that strengthen the
multi-harness story:

1. **`.rules/vendor-corpus.md`** — codified citation of which vendor doc
   is authoritative for which primitive (the §1 + §3 content as a load-
   bearing rule rather than a research doc).
2. **`data-sources/coding-agent-vendors.yaml`** — your existing
   `data-sources` repo could absorb §1 as a tracked feed. Pair with a
   weekly `compare_data_feeds` run to detect when a vendor doc page
   changes meaningfully.
3. **A `weather_report` extension** — add adapter-level rubric scoring
   so the existing weather report surfaces "Codex passes T1–T14 at 87%;
   OpenCode at 72%; Gemini at 65%." This makes the audit a recurring
   signal rather than a one-shot.
4. **A public `pr-review-experiment-results-v6.md`** — re-run the v5
   evaluation set with the structured error envelope from T5 in place,
   measure whether bug-catch rate stays at 100% and FP rate drops.
5. **AAIF / agents.md upstream contribution** — once the structured
   error envelope and tool-annotation conformance work is shipped,
   consider proposing it as a SEP or AGENTS.md extension. AAIF is now
   the steward (X4, X5).

---

## §12 References — at a glance

Single flat list for convenience; full descriptions in §1.

- A1: Provided Anthropic exam guide PDF (NTK)
- A2: https://www.anthropic.com/engineering/building-effective-agents
- A3: https://www.anthropic.com/engineering/claude-code-best-practices
- A4: https://www.anthropic.com/engineering/multi-agent-research-system
- A5: https://www.anthropic.com/engineering/writing-tools-for-agents
- A6: https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- A7: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- A8: https://www.anthropic.com/engineering/agent-skills
- A9: https://www.anthropic.com/engineering/claude-code-permissions
- A10: https://www.anthropic.com/engineering/code-execution-with-mcp
- A11: https://code.claude.com/docs/en/best-practices
- A12: https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents
- A13: https://www.anthropic.com/engineering/claude-think-tool
- A14: https://www.anthropic.com/engineering/desktop-extensions
- C1–C21: developers.openai.com/codex\* (see §1.2 for individual paths)
- G1–G6: geminicli.com/docs/_, developers.google.com/gemini-code-assist/_, github.com/google-gemini/gemini-cli
- O1–O4: opencode.ai/docs/\*, opencode.ai/config.json
- X1: https://agents.md/
- X2: https://modelcontextprotocol.io/specification/2025-11-25
- X3: https://github.com/modelcontextprotocol/modelcontextprotocol
- X4: https://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/
- X5: https://agentic.foundation/
- H1: https://cursor.com/docs/context/rules
- H2: https://aider.chat/docs/usage/conventions.html
- H3: https://github.com/Aider-AI/conventions
- H4: https://docs.continue.dev/reference
- H5: https://docs.continue.dev/customize/deep-dives/rules
- H6: https://ampcode.com/manual
- H7: https://github.com/sourcegraph/amp-examples-and-guides
- H8: https://docs.cline.bot/features/cline-rules
- H9: https://block.github.io/goose/docs/guides/using-goosehints/

---

_Document version 1.0 · 2026-05-13 · Targets `nexus-agents` ≥ 2.67.0_
