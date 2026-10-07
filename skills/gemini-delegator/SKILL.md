---
name: gemini-delegator
description: |
  Delegate large-context tasks to Gemini models through the agy
  (Antigravity) CLI. Use when context exceeds 100K tokens, when processing
  large codebases, or for speed/cost-sensitive operations.
  Triggers on "delegate to gemini", "route to gemini", "use gemini",
  "use agy", "large context".
allowed-tools: Bash, Read, Grep, Glob
---

# Gemini Delegator Skill

<!-- CANONICAL SOURCES:
  - docs/architecture/ROUTING_SYSTEM.md
  - packages/nexus-agents/src/mcp/tools/delegate-to-model.ts
  - skills/references/orchestration-patterns.md (multi-agent coordination, retry policies, deadline propagation)
-->

> **The standalone `gemini` CLI is retired** (#4389). It exits 55 with
> `IneligibleTierError` on every invocation. The `gemini` routing arm keeps its
> name but spawns `agy` (Google's Antigravity CLI), which serves the Gemini
> models. Every command below uses `agy`; do not shell out to `gemini`.

**Full documentation:**

- [ROUTING_SYSTEM.md](../../docs/architecture/ROUTING_SYSTEM.md)

## Real-World Performance (Tested 2026-01-18, on the retired gemini CLI)

| Metric             | Value                     | Notes                               |
| ------------------ | ------------------------- | ----------------------------------- |
| Max files analyzed | 978 files in single query | ~280k LOC processed successfully    |
| Latency (simple)   | 10-15 seconds             | Single directory analysis           |
| Latency (complex)  | 58-73 seconds             | Full codebase analysis              |
| Cache efficiency   | 94k tokens cached         | Significant cost savings            |
| Tool calls/session | Up to 20                  | File reads auto-executed            |
| Model routing      | flash-lite → pro          | Two-model approach for optimization |

## When to Delegate to Gemini

| Condition                 | Threshold/Criteria         | Reason                    |
| ------------------------- | -------------------------- | ------------------------- |
| Context size              | > 100K tokens              | Gemini: 1M context window |
| Large codebase analysis   | Multiple files, > 50 files | Fast bulk processing      |
| Speed-critical tasks      | Latency sensitive          | Flash models optimized    |
| Cost-sensitive operations | Budget constraints         | Flash models are cheaper  |
| Google Cloud integration  | BigQuery, Cloud Functions  | Native integration        |

## When NOT to Delegate

- Complex reasoning requiring deep analysis
- Security-critical implementations
- Production code generation needing high quality
- Tasks requiring careful planning and architecture

## Methods

### Method 1: delegate_to_model MCP Tool

Use the nexus-agents MCP tool for intelligent routing:

```bash
# The tool analyzes task and recommends optimal model
nexus-agents delegate_to_model --task "Analyze this 500K token codebase"
```

### Method 2: Direct `agy`

```bash
# Run one prompt non-interactively (print mode); prompt as the flag value
agy --print "Analyze this codebase"

# Or pipe the prompt on stdin — keeps large prompts out of argv
cat prompt.md | agy --output-format json

# JSON output for parsing
agy --print "Analyze this codebase" --output-format json

# Specify a model — slugs come from `agy models`, not the registry ids
agy --model gemini-3.8-flash-medium --print "Quick analysis task"
agy --model gemini-3.1-pro-high --print "Complex reasoning task"

# Name the workspace: agy defaults to its STORED project, not the cwd (#6254)
agy --add-dir "$PWD" --print "Review all files in src/" --output-format json
```

**JSON output:** `--output-format json` returns
`{conversation_id, status, response, duration_seconds, num_turns, usage}`.
**agy exits 0 even when the run failed**, so the verdict is the `status` field,
never the exit code:

```typescript
const result = JSON.parse(output);
if (result.status !== 'SUCCESS') throw new Error(result.error ?? `agy status ${result.status}`);
const response = result.response;
```

In TypeScript inside this repo, reuse `AgyResponseParser`
(`packages/nexus-agents/src/cli-adapters/parsers/agy-parser.ts`) instead of
re-parsing by hand.

**Not read-only.** agy cannot enforce read-only analysis (#6962): `--mode plan`
writes a plan and then executes it in print mode, and `--sandbox` restricts the
terminal, not file edits. Run it in a scratch checkout when it must not write.

**No image or file input.** agy has no flag for attaching images, audio or
video, and the nexus-agents agy path sends text only. The multimodal examples
that piped files into the retired `gemini` CLI no longer apply.

## Context Advantage

| Model        | Context Window | Best For           |
| ------------ | -------------- | ------------------ |
| Claude       | ~200K tokens   | Quality reasoning  |
| Gemini Pro   | 1M tokens      | Large context      |
| Gemini Flash | 200K-1M tokens | Speed, high volume |

**The 1M token context window enables:**

- Entire codebase analysis in single context
- Full documentation sets without chunking
- Complete git history review
- Large data file processing

## Output Formats

```bash
# Human readable (default)
agy --print "task"

# JSON for parsing (check `status`, see above)
agy --print "task" --output-format json

# Streaming JSON
agy --print "task" --output-format stream-json
```

## Process

1. **Evaluate task requirements:**
   - Estimate context size
   - Assess speed/cost sensitivity

2. **Choose delegation method:**
   - Use `delegate_to_model` for intelligent routing
   - Use direct `agy` for explicit control

3. **Configure execution:**
   - Select a model slug from `agy models` (Pro vs Flash)
   - Set `--output-format json` for parsing
   - Pass `--add-dir` for the tree agy should work in

4. **Process results:**
   - Check `status === 'SUCCESS'` before reading `response`
   - Integrate findings into workflow

## Quick Reference

```bash
# Large context analysis
agy --add-dir "$PWD" --print "Analyze this entire codebase structure"

# Fast iteration
agy --model gemini-3.8-flash-medium --print "Quick review" --output-format json

# Cost-sensitive batch
for f in *.ts; do agy --print "Review: $(cat "$f")" >> reviews.txt; done
```

## Anti-rationalization — Gemini delegation

| Excuse                                        | Counter                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| "Gemini for everything, it has a big context" | Big context isn't free — output quality varies by task. Use Gemini for >100k context or research-shaped tasks. |
| "I'll use Gemini even for short code-gen"     | Codex is faster on code. Use Gemini when context size forces the choice.                                       |

## Red flags

- Gemini used for short single-file code-gen (Codex is faster)
- A command that shells out to the retired `gemini` binary instead of `agy`
- Success inferred from agy's exit code instead of its `status` field
- Context exceeded 1M without verification of token budget

## Verification checklist

- [ ] Task category matches Gemini's strengths (large context, research)
- [ ] Token estimate confirmed within Gemini's context window before dispatch
- [ ] Outcome recorded for adaptive routing
