---
'nexus-agents': minor
---

**Breaking (TypeScript-typed only)**: Remove the deprecated `'tech_lead'` member from the `AgentRole` union (Batch B of #2368, completes #1986 partial).

The `'tech_lead'` role string has been a documented alias of `'orchestrator'` since #595/#759 (multi-month bake). It is removed from:

- `AgentRole` union in `core/types/agent.ts`
- `OrchestratorRole` derived type (now `Extract<AgentRole, 'orchestrator'>`)
- All `z.enum` role schemas: `agent-schemas.ts`, `workflows/template-types.ts`, `workflows/workflow-types.ts`, `workflows/aflow/aflow-types.ts`, `workflows/aflow/evaluation-types.ts`, `agents/tech-lead-types.ts` (2 schemas), `agents/collaboration/collaboration-schemas.ts`, `agents/experts/expert-config.ts`, `agents/skills/skill-loader-types.ts`, `agents/skills/skill-security-schemas.ts`
- `EXPERT_CAPABILITIES` map (`tech-lead-types.ts`, `experts/expert-types.ts`)
- `MEMORY_BY_ROLE` map (`context/memory-types.ts`)
- `DEFAULT_RBAC.allowedRoles` (`skills/skill-security-types.ts`)
- `DEFAULT_ROLE_SKILLS` (`skills/skill-loader-types.ts`)
- `Orchestrator` class — now self-identifies as `role: 'orchestrator'` (was `'tech_lead'`) with default `id: 'orchestrator'`

**Migration**: replace `'tech_lead'` with `'orchestrator'` everywhere it's used as a role name. Runtime behavior is unchanged — both names mapped to identical capability sets.

**Out of scope (separate follow-up)**: the unrelated `OrchestratorType = 'tech_lead' | 'workflow' | 'puppeteer' | 'custom'` discriminator union in `core/types/orchestrator.ts` (an orchestrator-implementation discriminator, not an agent role) keeps `'tech_lead'` for now. Will rename in a focused PR.
