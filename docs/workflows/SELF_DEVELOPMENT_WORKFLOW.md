---
title: Self-Development Meta-Workflow
description: Meta-workflow enabling nexus-agents to analyze issues, plan implementations, achieve consensus, and execute changes autonomously
tier: 2
keywords:
  [self-development, meta-workflow, autonomous, trinity, reflexion, consensus, docker, sandbox]
---

# Self-Development Meta-Workflow Specification

**Version:** 2.4.0
**Status:** COMPLETE (All Implementation Phases Done)
**Date:** 2026-01-09 (ET)
**GitHub Issue:** [#144](https://github.com/williamzujkowski/nexus-agents/issues/144)

---

## Prerequisites

| Prerequisite                   | Description                                                             | Tracking       |
| ------------------------------ | ----------------------------------------------------------------------- | -------------- |
| **v2.3.0 CLI Adapters Stable** | Claude, Gemini, Codex adapters production-ready (1 day 0 critical bugs) | Issues #75-#77 |
| **v2.3.0 Quality Router**      | Quality-based model routing tested                                      | Issue #78      |
| **Docker Available**           | Docker CLI available for sandboxed execution                            | Verified       |
| **Security Audit Complete**    | All security safeguards implemented and tested                          | This document  |

**Stability Definition:** Zero critical bugs for 1 calendar day after deployment.

---

## Executive Summary

This specification defines a meta-workflow for nexus-agents self-development. The workflow enables the system to analyze open issues, plan implementations using its own protocols (TRINITY, Consensus, Reflexion), achieve multi-agent consensus, obtain human approval, and execute implementation using Self-Debug and Self-Refine protocols.

**Security Model:** All code execution occurs in Docker containers with strict resource limits. Human approval is required for **plan approval only** (Phase 6). After approval, automated security gates (input sanitization, Docker sandbox, security scans) handle execution. PRs are created for milestone changes to enable tracking and rollback. Only repository owner can trigger workflows.

**Autonomy Model:** After human approves the plan, the workflow runs autonomously through security gates. Humans receive notifications but are not blockers. Rate limiting is optional and disabled by default.

---

## Workflow Overview

```
 +-------------+     +-------------+     +-------------+
 |   ANALYZE   |---->|  RESEARCH   |---->|    PLAN     |
 | (Sanitized) |     | (Context)   |     | (TRINITY)   |
 +-------------+     +-------------+     +-------------+
        |                  |                   |
        v                  v                   v
 +-------------+     +-------------+     +-------------+
 |    VOTE     |<----|   REVIEW    |<----|   REFINE    |
 | (Consensus) |     | (Human)     |     | (Reflexion) |
 +-------------+     +-------------+     +-------------+
        |
        | [PLAN APPROVED - Autonomous from here]
        v
 +-------------+     +-------------+     +-------------+
 |  GENERATE   |---->|  IMPLEMENT  |---->|   SECURE    |
 | (Code)      |     | (Sandboxed) |     |   CHECK     |
 +-------------+     +-------------+     +-------------+
        |                  |                   |
        v                  v                   v
 +-------------+     +-------------+     +-------------+
 |   VERIFY    |---->|   COMMIT    |---->| MILESTONE   |
 | (Tests)     |     | (PR)        |     |   PR        |
 +-------------+     +-------------+     +-------------+
                                               |
                                      [Notify human, auto-merge]
```

## Phases Summary

| Phase | Name           | Protocol(s)                       | Output                 | Human Checkpoint |
| ----- | -------------- | --------------------------------- | ---------------------- | ---------------- |
| 1     | Analyze        | Adaptive + Input Sanitization     | Prioritized issue list | No               |
| 2     | Research       | Parallel execution                | Context & prior art    | No               |
| 3     | Plan           | TRINITY (Thinker/Worker/Verifier) | Implementation plan    | No               |
| 4     | Refine         | Reflexion (multi-persona critics) | Refined plan           | No               |
| 5     | Vote           | Consensus (5-agent vote)          | Approval/rejection     | No               |
| 6     | Review         | Human checkpoint                  | Plan approval          | **YES**          |
| 6.5   | Code Review    | Human checkpoint                  | Code approval          | **YES**          |
| 7     | Implement      | Self-Debug (Docker sandbox)       | Working code           | No (automated)   |
| 7.5   | Security Check | SecureCodeChecker                 | Security scan results  | No (automated)   |
| 8     | Verify         | Test execution                    | Test results           | No (automated)   |
| 9     | Commit         | Git operations                    | Milestone PR           | No (notify only) |

**Note:** After Phase 6 (Plan Approval), the workflow runs autonomously. Security is enforced by automated gates (Docker sandbox, security scans, test verification).

---

## Sub-Documents

This workflow specification is split into focused sub-documents for readability:

| Document                                                | Contents                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Phases 1-6](./self-dev-phases.md)                      | Analyze, Research, Plan (TRINITY), Refine (Reflexion), Vote (Consensus), Review (Human) |
| [Execution Phases](./self-dev-execution.md)             | Code Review, Implement (Docker sandbox), Security Check, Verify, Commit                 |
| [Operations](./self-dev-operations.md)                  | Error handling, configuration, metrics, rate limiting, rollback, runbook, audit trail   |
| [Validation & Implementation](./self-dev-validation.md) | Improvement validation protocol (Tier 1-3 gates), WIS framework, implementation notes   |

---

## Research Integration

| Paper            | Technique             | Integration Point   |
| ---------------- | --------------------- | ------------------- |
| arXiv:2512.04695 | TRINITY               | Phase 3 (Plan)      |
| arXiv:2512.20845 | Multi-Agent Reflexion | Phase 4 (Refine)    |
| arXiv:2303.17651 | Self-Refine           | Phase 7 (Implement) |
| arXiv:2304.05128 | Self-Debug            | Phase 7 (Implement) |
| arXiv:2502.19130 | Adaptive Selection    | Phase 1 (Analyze)   |

---

## Approval

This specification requires multi-agent consensus before implementation:

| Agent     | Vote    | Notes                    |
| --------- | ------- | ------------------------ |
| Architect | APPROVE | v2.0.0 security model    |
| Security  | APPROVE | Docker sandbox adequate  |
| DevEx     | APPROVE | Human checkpoints clear  |
| AI/ML     | APPROVE | Protocol selection sound |
| PM        | APPROVE | Risk/value balanced      |

**Threshold:** Supermajority (4/5) required. **Result:** Unanimous (5/5).

---

_Specification created: 2026-01-08 (ET)_
_Revision: 2.4.0 - Split into sub-documents for governance compliance_
_Protocol versions: TRINITY v1, Reflexion v1, Consensus v1_
