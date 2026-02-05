---
title: MCP Tools Reference
description: Complete reference for all 15 MCP tools available in nexus-agents
---

## Overview

Nexus-agents exposes 15 tools via the Model Context Protocol (MCP). All tools use JSON-RPC 2.0 over stdio and require no authentication in local mode.

**Rate limiting:** All tools share a single token bucket rate limiter (capacity: 100 tokens, refill: 10 tokens/sec).

## Tools

### Orchestration

| Tool | Description |
|------|-------------|
| `orchestrate` | Analyze a task, break it into subtasks, and coordinate expert agents |
| `create_expert` | Create a specialized expert agent (code, architecture, security, documentation, testing, devops, research) |
| `execute_expert` | Execute a task using a previously created expert agent |
| `delegate_to_model` | Route a task to the optimal model based on capability matching |

### Workflows

| Tool | Description |
|------|-------------|
| `run_workflow` | Execute a workflow template with provided inputs |
| `list_workflows` | List available workflow templates |
| `list_experts` | List available expert types that can be created |

### Consensus

| Tool | Description |
|------|-------------|
| `consensus_vote` | Multi-model consensus voting on proposals with configurable strategies |

### Research

| Tool | Description |
|------|-------------|
| `research_query` | Query the research registry for status, overlaps, stats, or text search |
| `research_add` | Add a paper to the registry by arXiv ID with metadata fetching |
| `research_discover` | Discover new papers and repos from arXiv, GitHub, and other sources |
| `research_analyze` | Analyze the registry for gaps, trends, priorities, stale entries, or coverage |
| `research_catalog_review` | Review auto-cataloged research references found during tool execution |

### Memory

| Tool | Description |
|------|-------------|
| `memory_query` | Query across all memory backends with unified results and relevance scoring |
| `memory_stats` | Get memory system statistics dashboard with backend availability and metrics |

## Full Reference

For complete tool schemas, CLI commands, and REST API documentation, see the [Entrypoints Reference](https://github.com/williamzujkowski/nexus-agents/blob/main/docs/ENTRYPOINTS.md).
