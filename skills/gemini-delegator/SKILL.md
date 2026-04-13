---
name: gemini-delegator
description: |
  Delegate large context and multimodal tasks to Gemini CLI.
  Use when context exceeds 100K tokens, analyzing images/screenshots,
  processing large codebases, or for speed/cost-sensitive operations.
  Triggers on "delegate to gemini", "route to gemini", "use gemini",
  "large context", "analyze image", "screenshot analysis".
allowed-tools: Bash, Read, Grep, Glob
---

# Gemini Delegator Skill

<!-- CANONICAL SOURCES:
  - docs/research/_legacy/gemini-cli-research.md
  - docs/architecture/ROUTING_SYSTEM.md
  - packages/nexus-agents/src/mcp/tools/delegate-to-model.ts
-->

**Full documentation:**

- [Gemini CLI Research](../../docs/research/_legacy/gemini-cli-research.md)
- [ROUTING_SYSTEM.md](../../docs/architecture/ROUTING_SYSTEM.md)

## Real-World Performance (Tested 2026-01-18)

| Metric             | Value                     | Notes                               |
| ------------------ | ------------------------- | ----------------------------------- |
| Max files analyzed | 978 files in single query | ~280k LOC processed successfully    |
| Latency (simple)   | 10-15 seconds             | Single directory analysis           |
| Latency (complex)  | 58-73 seconds             | Full codebase analysis              |
| Cache efficiency   | 94k tokens cached         | Significant cost savings            |
| Tool calls/session | Up to 20                  | File reads auto-executed            |
| Model routing      | flash-lite → pro          | Two-model approach for optimization |

## When to Delegate to Gemini

| Condition                 | Threshold/Criteria         | Reason                      |
| ------------------------- | -------------------------- | --------------------------- |
| Context size              | > 100K tokens              | Gemini: 1M context window   |
| Large codebase analysis   | Multiple files, > 50 files | Fast bulk processing        |
| Image/screenshot analysis | Any visual content         | Native multimodal support   |
| Video/audio processing    | Any A/V content            | Native multimodal support   |
| Speed-critical tasks      | Latency sensitive          | Flash models optimized      |
| Cost-sensitive operations | Budget constraints         | Generous free tier (1K/day) |
| Google Cloud integration  | BigQuery, Cloud Functions  | Native integration          |

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

### Method 2: Direct Gemini CLI

```bash
# Basic delegation (human-readable output)
gemini -p "Analyze this codebase"

# JSON output for parsing (note: response may contain markdown fences)
gemini -p "Analyze this codebase" --output-format json

# With auto-approve for autonomous operation
gemini --yolo -p "Review all files in src/" --output-format json

# Specify model
gemini -m gemini-2.5-flash -p "Quick analysis task"
gemini -m gemini-3-pro-preview -p "Complex reasoning task"
```

**JSON Output Parsing Note:** The `response` field in JSON output may contain markdown code fences. Parse accordingly:

````typescript
const result = JSON.parse(output);
const response = result.response.replace(/```\w*\n?/g, '').trim();
````

## Multimodal Examples

### Image Analysis

```bash
# Analyze screenshot
gemini -p "Describe this UI and identify usability issues" < screenshot.png

# Analyze architecture diagram
gemini -p "Extract components and relationships from this diagram" < diagram.png

# Code screenshot OCR
gemini -p "Extract the code from this screenshot" < code-image.png
```

### Video Analysis

```bash
# Analyze video content (uses File API for > 1 minute)
gemini -p "Summarize the key points from this demo video" < demo.mp4
```

### Batch Processing

```bash
# Process multiple images
for img in screenshots/*.png; do
  gemini -p "Analyze this UI screenshot" < "$img" --output-format json >> results.json
done
```

## Context Advantage

| Model        | Context Window | Best For                  |
| ------------ | -------------- | ------------------------- |
| Claude       | ~200K tokens   | Quality reasoning         |
| Gemini Pro   | 1M tokens      | Large context, multimodal |
| Gemini Flash | 200K-1M tokens | Speed, high volume        |

**The 1M token context window enables:**

- Entire codebase analysis in single context
- Full documentation sets without chunking
- Complete git history review
- Large data file processing

## Output Formats

```bash
# Human readable (default)
gemini -p "task"

# JSON for parsing
gemini -p "task" --output-format json

# Streaming JSON for real-time
gemini -p "task" --output-format stream-json
```

## Process

1. **Evaluate task requirements:**
   - Estimate context size
   - Check for multimodal content
   - Assess speed/cost sensitivity

2. **Choose delegation method:**
   - Use `delegate_to_model` for intelligent routing
   - Use direct Gemini CLI for explicit control

3. **Configure execution:**
   - Select appropriate model (Pro vs Flash)
   - Set output format for parsing
   - Use `--yolo` for autonomous tasks

4. **Process results:**
   - Parse JSON output
   - Integrate findings into workflow

## Quick Reference

```bash
# Large context analysis
gemini -p "Analyze this entire codebase structure" --yolo

# Screenshot analysis
gemini -p "What does this UI show?" < screenshot.png

# Fast iteration
gemini -m gemini-2.5-flash -p "Quick review" --output-format json

# Cost-sensitive batch
for f in *.ts; do gemini -p "Review: $(cat $f)" >> reviews.txt; done
```
