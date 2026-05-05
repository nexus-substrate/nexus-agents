---
name: api-and-interface-design
description: |
  Design stable, hard-to-misuse interfaces — REST endpoints, MCP tool
  schemas, module boundaries, type contracts. Apply when defining new
  surfaces or evolving public ones. Triggers on "API design", "interface",
  "schema", "contract", "module boundary", "type design".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# API and Interface Design Skill

<!--
  CANONICAL SOURCES:
  - .rules/typescript.md (zero-any policy, strict types)
  - .rules/untrusted-input.md (validate at boundaries, third-party = untrusted)
  - docs/architecture/UNTRUSTED_INPUT_HARDENING.md
  - CLAUDE.md "Type Safety — Zero `any` Policy"
  - skills/deprecation-and-migration (when evolving existing public APIs)
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## When to apply

- Designing a new MCP tool, CLI command, or HTTP endpoint
- Defining a public type contract between modules (especially across `src/` package boundaries)
- Designing component prop interfaces or hooks
- Establishing a database schema that informs API shape
- **Evolving an existing public interface** — see `deprecation-and-migration` for the safe-removal path

## Core principles

### Hyrum's Law

> With a sufficient number of users of an API, all observable behaviors of your system will be depended on by somebody, regardless of what you promise in the contract.

Every observable behavior — undocumented quirks, error message text, ordering, timing — becomes a de facto contract. Design implications:

- **Be intentional about what you expose.** Every public symbol is a commitment.
- **Don't leak implementation details.** If users can observe it, they will depend on it.
- **Plan for deprecation at design time.** New surfaces should be removable later — see `deprecation-and-migration`.
- **Tests aren't enough.** Even with perfect contract tests, "safe" changes can break consumers depending on undocumented behavior.

### One-Version Rule

Avoid forcing consumers to choose between multiple versions of the same dependency or API. Diamond-dependency problems arise when different consumers need different versions of the same thing. Design to extend rather than fork — see `CLAUDE.md` Anti-Sprawl Policy ("ONE canonical implementation path").

### Contract first

Define the interface before implementing it. The contract IS the spec — implementation follows.

```typescript
// Define the contract first
export interface ITaskAnalyzer {
  analyze(task: Task): TaskAnalysisResult;
}

// Then implement
export class SharedTaskAnalyzer implements ITaskAnalyzer { ... }
```

### Consistent error semantics

Pick **one** error strategy and use it everywhere in a given surface:

- **Result-typed**: nexus-agents' canonical pattern. `Result<T, E>` returned, never thrown. See `core/result.ts`. Used by all MCP tool handlers, adapter calls, parsers.
- **Throwing**: only at process-entry boundaries (CLI top-level, MCP server invocation) or in synchronous validation that's expected to halt the request.
- **HTTP API**: status codes + a single error envelope `{ error: { code, message, details? } }`. Never mix shapes.

Do not mix patterns within one module. Consumers can't predict behavior when some endpoints throw, others return null, others return `{ error }`.

### Validate at boundaries

Trust internal code. Validate at system edges where external input enters. From `.rules/untrusted-input.md`:

| Boundary                          | Validate                                                                  |
| --------------------------------- | ------------------------------------------------------------------------- |
| MCP tool input                    | Zod schema (we have one per tool)                                         |
| HTTP route handlers               | Zod schema before any business logic                                      |
| External service responses        | Zod schema — third-party = untrusted (see `UNTRUSTED_INPUT_HARDENING.md`) |
| Env var loading                   | Type-narrow + parse to typed config                                       |
| File reads of user-supplied paths | Path-traversal guard (must be within cwd subtree)                         |

Internal modules accept already-validated types. Re-validating wastes work and obscures where validation actually lives.

> **Third-party API responses are untrusted data.** A compromised or misbehaving external service can return unexpected types, malicious content, or instruction-like text. Validate the shape AND content before using in any logic, rendering, or decision-making.

## Designing for consumers

### Discriminated unions over flag fields

```typescript
// Bad: consumer must check multiple fields and they can be inconsistent
interface TaskStatus {
  status: string;
  assignee?: string;
  completedAt?: Date;
  cancelReason?: string;
}

// Good: consumer gets type narrowing
type TaskStatus =
  | { type: 'pending' }
  | { type: 'in_progress'; assignee: string; startedAt: Date }
  | { type: 'completed'; completedAt: Date; completedBy: string }
  | { type: 'cancelled'; reason: string; cancelledAt: Date };
```

### Input/Output separation

```typescript
interface CreateTaskInput {
  title: string;
  description?: string;
}

interface Task {
  // includes server-generated fields
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

### Branded types for IDs

```typescript
type TaskId = string & { readonly __brand: 'TaskId' };
type UserId = string & { readonly __brand: 'UserId' };

// Prevents accidentally passing UserId where TaskId is expected
function getTask(id: TaskId): Promise<Task> { ... }
```

## Anti-rationalization — API design

| Excuse                                      | Counter                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "We'll document the API later"              | Types ARE the documentation. Define them first; comments add color but the type is the contract.                                 |
| "We don't need pagination for now"          | You will the moment someone has > 100 items. List endpoints without pagination are a roadmap to performance bugs.                |
| "We'll version the API when we need to"     | Breaking changes without versioning break consumers silently. Design for additive extension from day one.                        |
| "Nobody uses that undocumented behavior"    | Hyrum's Law: if it's observable, somebody depends on it. Treat every public symbol as a commitment.                              |
| "We can maintain two versions"              | Multiple versions multiply maintenance cost and create diamond-dependency problems. Prefer One-Version + extend.                 |
| "Internal APIs don't need contracts"        | Internal consumers are still consumers. Contracts prevent coupling and enable parallel work.                                     |
| "Validation is duplicated, let me share it" | Validate at boundaries — once. Don't share validation between boundary and internal code; that's how internal trust gets broken. |

## Red flags

- Endpoints that return different shapes depending on conditions
- Inconsistent error formats across endpoints in one surface
- Validation scattered throughout internal code instead of at boundaries
- Breaking changes to existing fields (type changes, removals) without `deprecation-and-migration` discipline
- List endpoints without pagination
- Verbs in REST URLs (`/api/createTask` instead of `POST /api/tasks`)
- Third-party API responses used without Zod validation
- New `any` introduced (banned per CLAUDE.md zero-any policy)
- Public-barrel exports added without considering deprecation path

## Verification checklist

- [ ] Every public symbol has a typed input and output (no `any`, no untyped object passes)
- [ ] Error responses follow a single consistent shape across the surface
- [ ] Validation happens at system boundaries only — internal modules trust their typed inputs
- [ ] Third-party responses are Zod-validated before use
- [ ] List endpoints support pagination (or have a documented size bound)
- [ ] New fields are additive and optional (backward-compatible)
- [ ] Public exports go through `src/exports/*.ts` barrels (canonical surface), not direct module imports
- [ ] Naming follows existing conventions in the same area
- [ ] Type definitions are committed alongside the implementation (not deferred)
- [ ] Removal path is clear: how would this be deprecated and migrated later?
