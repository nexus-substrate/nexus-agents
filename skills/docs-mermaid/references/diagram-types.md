# Mermaid Diagram Types — Templates

Copy-pasteable templates for the seven Mermaid types nexus-agents docs
use. Each template paired with a _"when to choose this"_ rule and a
nexus-agents-flavored example.

## flowchart

**Use when:** the diagram answers _"what are the branches in this
decision?"_ — dispatch tables, decision trees, request routing.

```mermaid
flowchart TD
    A[Task arrives] --> B{Has fixture path?}
    B -->|yes| C[loadFromFixture]
    B -->|no| D[loadFromHf]
    C --> E[Return trajectories]
    D --> F{Network reachable?}
    F -->|yes| E
    F -->|no| G[Throw HF load failed]
```

Direction: `TD` (top-down) for stacked decisions, `LR` (left-right) for
horizontal pipelines. Avoid `BT` and `RL` unless you have a specific
reason.

## sequenceDiagram

**Use when:** the diagram answers _"in what order does X happen?"_ —
RPC flows, message exchanges, coordination protocols.

```mermaid
sequenceDiagram
    participant V as Voter (architect)
    participant E as ConsensusEngine
    participant A as Claude Adapter
    participant G as Gateway

    V->>E: collectVote(proposal)
    E->>A: complete(prompt)
    A->>G: POST /v1/chat/completions
    G-->>A: ChatCompletion
    A-->>E: { decision, reasoning, usage }
    E-->>V: vote recorded
```

`->>` for synchronous calls, `-->>` for replies. Use `Note over X:` for
side comments without forcing them into a participant role.

## stateDiagram-v2

**Use when:** the diagram answers _"what state is X in, and how does it
transition?"_ — lifecycles, retries, finite state machines.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> voting: open()
    voting --> quorum_check: vote arrived
    quorum_check --> voting: more votes needed
    quorum_check --> approved: quorum + threshold met
    quorum_check --> rejected: quorum + threshold missed
    voting --> timeout: deadline reached
    approved --> [*]
    rejected --> [*]
    timeout --> [*]
```

Use `[*]` for start / end. Use `state X { ... }` for nested compound
states (e.g., a retry-loop within an attempt).

## classDiagram

**Use when:** the diagram answers _"what types exist and how do they
relate?"_ — type hierarchies, interface implementations.

```mermaid
classDiagram
    class IModelAdapter {
        +providerId: string
        +modelId: string
        +complete(req) Promise~Result~
        +stream(req) AsyncIterable
    }
    class OpenAIAdapter
    class ClaudeAdapter
    class OpenAICompatAdapter

    IModelAdapter <|.. OpenAIAdapter
    IModelAdapter <|.. ClaudeAdapter
    IModelAdapter <|.. OpenAICompatAdapter
    OpenAICompatAdapter ..> OpenAIAdapter: wraps
```

`<|..` for "implements interface", `..>` for "uses / depends on", `<|--`
for "extends class".

## erDiagram

**Use when:** the diagram answers _"what does the data model look
like?"_ — table relationships, schema graphs.

```mermaid
erDiagram
    PROPOSAL ||--o{ VOTE: collects
    PROPOSAL {
        string id PK
        string title
        string status
        timestamp createdAt
    }
    VOTE ||--|| VOTER: cast_by
    VOTE {
        string proposalId FK
        string voterRole
        string decision
        float confidence
    }
    VOTER {
        string role PK
        string description
    }
```

Cardinality: `||--o{` is one-to-many, `||--||` is one-to-one,
`}o--o{` is many-to-many.

## gantt

**Use when:** the diagram answers _"how do these tasks parallelise and
what depends on what?"_ — release plans, sprint roadmaps, epic
breakdown.

```mermaid
gantt
    title Epic #2467 — week of 2026-05-09
    dateFormat YYYY-MM-DD
    section Foundations
    Auto-scaffold registry  :done, 2026-05-09, 1d
    Sandbox auto-detect     :done, 2026-05-09, 1d
    section Adapter
    Generic OpenAI-compat   :done, after Sandbox auto-detect, 1d
    Wire usage recording    :done, after Generic OpenAI-compat, 1d
    section Reporting
    Usage command           :done, after Generic OpenAI-compat, 1d
```

Sections group related tasks. `:done`, `:active`, `:crit` mark status.

## gitGraph

**Use when:** the diagram answers _"what does the branching shape of
this history look like?"_ — release flow, GitFlow, trunk-based
diagrams.

```mermaid
gitGraph
    commit id: "main"
    branch fix/2470
    checkout fix/2470
    commit id: "scaffold helper"
    commit id: "wire load helpers"
    checkout main
    merge fix/2470
    branch feat/2468
    commit id: "openai-compat adapter"
    checkout main
    merge feat/2468
```

Useful for explaining branching policy, less useful for RFCs.

## Anti-patterns

- **Defaulting every request to `flowchart`.** Most diagrams the user
  describes as "a flowchart" are actually sequence or state diagrams.
  Classify before drawing.
- **Cramming `pie` charts where a real chart belongs.** Mermaid's pie
  is ugly and inflexible. For data viz, use `docs-chart`.
- **Stacking `subgraph`s deeper than two levels** in `flowchart`. Hard
  to read; consider splitting into multiple diagrams or switching to
  `classDiagram` / `erDiagram`.
- **Putting actual code inside diagrams.** Mermaid is for shape, not
  content. If you need code blocks, use a regular code fence next to
  the diagram.
- **Implementing what `nexus-agents visualize` already does.** Wrap the
  CLI when the use case is a dashboard or routing table.
