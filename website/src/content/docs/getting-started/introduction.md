---
title: Introduction
description: What nexus-agents is, why it exists, and how it differs from other multi-agent frameworks.
---

Nexus Agents is a multi-agent orchestration server that coordinates AI experts to handle complex software development tasks. It implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) to integrate with Claude Desktop and Claude CLI, while also supporting standalone operation and REST API access.

## The Problem

Building reliable multi-agent systems is harder than it looks:

1. **Models disagree.** Ask three LLMs the same question and you get three different answers. Which one is correct?

2. **Models fail silently.** A model might return a plausible-sounding response that's completely wrong. Without verification, errors propagate.

3. **Context gets lost.** Long conversations exhaust context windows. Important information from early in a session disappears.

4. **Routing is guesswork.** Choosing which model to use for each task is typically hardcoded or random. There's no learning from outcomes.

5. **Security is an afterthought.** Most multi-agent frameworks store API keys in plain text and execute arbitrary code without sandboxing.

## The Solution

Nexus Agents addresses each of these problems with **research-backed protocols** that have been validated in academic literature:

| Problem                     | Solution                                   | Research                     |
| --------------------------- | ------------------------------------------ | ---------------------------- |
| Models disagree             | Byzantine consensus protocols              | Aegean (arXiv:2512.20184)    |
| Models fail silently        | Multi-agent critique and verification      | Reflexion (arXiv:2303.11366) |
| Context gets lost           | 8 specialized memory systems               | MIRIX (arXiv:2507.07957)     |
| Routing is guesswork        | Contextual bandits with learning           | PILOT (arXiv:2508.21141)     |
| Security is an afterthought | Sandboxed execution, zero-credential OAuth | Docker + OAuth 2.0/PKCE      |

## Key Concepts

### Experts

Nexus Agents uses specialized experts for different domains:

| Expert                  | Focus                                                  |
| ----------------------- | ------------------------------------------------------ |
| **Code Expert**         | Implementation, debugging, optimization, refactoring   |
| **Architecture Expert** | System design, patterns, trade-offs, scalability       |
| **Security Expert**     | Vulnerability analysis, secure coding, threat modeling |
| **Performance Expert**  | Profiling, optimization, benchmarking                  |
| **Research Expert**     | Literature review, technique identification            |

Each expert has domain-specific system prompts and capabilities. The **Tech Lead** agent analyzes incoming tasks and delegates to the appropriate experts automatically.

### Consensus Protocols

When experts disagree, consensus protocols determine the final answer:

- **Simple Majority** - Fast decisions for non-critical tasks
- **Supermajority** - Architecture decisions requiring broad agreement
- **Unanimous** - Security-critical changes requiring 100% agreement
- **Aegean** - Byzantine fault tolerance for untrusted environments
- **Reflexion** - Iterative critique and refinement

The system automatically selects the appropriate protocol based on task type.

### Routing

Task routing determines which model handles each request:

```
Task Analysis → Budget Check → TOPSIS Ranking → LinUCB Selection
```

1. **Task Analysis** - Classify complexity, domain, and requirements
2. **Budget Check** - Filter models that exceed token/cost/latency limits
3. **TOPSIS Ranking** - Multi-criteria optimization (quality vs. cost vs. latency)
4. **LinUCB Selection** - Contextual bandit that learns from outcomes

The router improves over time by tracking which models perform best for each task type.

### Memory Systems

Eight memory systems handle different types of information:

| Memory         | Purpose                              |
| -------------- | ------------------------------------ |
| **Session**    | Current conversation context         |
| **Graph**      | Entity relationships and connections |
| **Adaptive**   | Priority-weighted retrieval          |
| **Typed**      | Six-type MIRIX architecture          |
| **Agentic**    | Zettelkasten-style linked notes      |
| **Episodic**   | Past task experiences                |
| **Semantic**   | Domain knowledge                     |
| **Procedural** | Learned workflows                    |

## What Nexus Agents Is Not

**Not a model provider.** Nexus Agents coordinates models from Anthropic, OpenAI, Google, and local providers (Ollama). It does not train or host models.

**Not a chatbot framework.** While it can power chat applications, nexus-agents is designed for programmatic orchestration of software development tasks.

**Not a replacement for Claude Code.** Nexus Agents is designed to work _with_ Claude Code as an MCP server, extending its capabilities with multi-agent coordination.

## Architecture Overview

```
┌─────────────────────────────────────────┐
│       External Interface Layer          │
│  MCP Gateway │ REST API │ CLI           │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│    Internal Orchestration Layer         │
│  Event Bus │ Tech Lead │ Consensus      │
└────────────────────┬────────────────────┘
                     │
┌────────────────────▼────────────────────┐
│         Execution Layer                 │
│  CLI Adapters │ Model APIs │ Workflows  │
└─────────────────────────────────────────┘
```

The hybrid architecture supports three modes:

- **Server Mode** - MCP server for Claude Desktop/CLI integration
- **Orchestrator Mode** - Standalone CLI for scripts and automation
- **Mesh Mode** - Full hybrid with both capabilities

## Requirements

- **Node.js 22.x LTS** (required)
- **pnpm 9.x** or **npm 10.x** (recommended)
- **Docker** (optional, for sandboxed execution)

At least one model provider:

- Anthropic API key for Claude models
- OpenAI API key for GPT models
- Google AI API key for Gemini models
- Ollama installation for local models

## Next Steps

Ready to get started?

1. [Quick Start](/nexus-agents/getting-started/quick-start/) - 5-minute setup guide
2. [Installation](/nexus-agents/getting-started/installation/) - Detailed installation instructions
3. [Configuration](/nexus-agents/getting-started/configuration/) - Configure models and behavior
