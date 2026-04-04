# Security Research

**Topic:** Agent safety analysis and evaluation
**Papers:** 2 | **Techniques:** 2

---

## Overview

Research on safety analysis and evaluation for multi-agent systems, including formal hazard analysis and comprehensive safety benchmarking.

---

## Techniques

### Implemented

| Technique                                                              | Paper            | Issue | Key Metrics                               |
| ---------------------------------------------------------------------- | ---------------- | ----- | ----------------------------------------- |
| [STPA MCP Framework](../../registry/techniques.yaml#stpa-mcp-safety)   | arXiv:2601.08012 | #328  | Formal STPA safety analysis for MCP tools |
| [Agent-SafetyBench](../../registry/techniques.yaml#agent-safety-bench) | arXiv:2412.14470 | #332  | Safety evaluation suite integration       |

---

## Papers

| Paper             | ArXiv            | Key Contribution                                          |
| ----------------- | ---------------- | --------------------------------------------------------- |
| STPA for MCP      | arxiv-2601.08012 | System-Theoretic Process Analysis for MCP tool safety     |
| Agent-SafetyBench | arxiv-2412.14470 | Comprehensive safety evaluation suite for agent behaviors |

---

## Source Files

| File                                             | Purpose                      |
| ------------------------------------------------ | ---------------------------- |
| `src/mcp/safety/stpa-analyzer.ts`                | STPA analysis implementation |
| `src/mcp/safety/hazard-catalog.ts`               | Hazard definitions           |
| `src/security/safety-bench/safety-categories.ts` | Safety taxonomy              |

---

## Related Documents

- **Full Index:** [RESEARCH_INDEX.md](../../RESEARCH_INDEX.md)
- **Techniques Registry:** [techniques.yaml](../../registry/techniques.yaml)

---

_Last updated: 2026-04-03 (ET)_
