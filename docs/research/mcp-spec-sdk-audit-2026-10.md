---
title: MCP spec and SDK audit (2026-10)
description: Version drift between the MCP revision and TypeScript SDK this repo targets and what is current upstream, plus a build-vs-adopt call for each hand-rolled feature the protocol or SDK now covers.
tier: 2
keywords: [mcp, sdk, outputSchema, listChanged, tasks, roots, logging, protocol-version, audit]
---

# MCP spec and SDK audit (2026-10)

**Issue:** #5139. **Context:** #5134, #5066, #5132, #4978, #4485.
**Date:** 2026-10-04 (ET). This is research only. It changes no code, and any
migration it recommends needs its own vote.
Repo paths starting with `src/` are relative to `packages/nexus-agents/`. SDK paths
are relative to the installed `@modelcontextprotocol/sdk@1.31.0` package unless stated.

## 1. Version drift

| Claim                 | Evidence                                                                                                                                                                                          | Verdict                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| SDK range `^1.31.0`   | `packages/nexus-agents/package.json:86`                                                                                                                                                           | as stated                   |
| Resolved SDK `1.31.0` | `pnpm-lock.yaml:150-152`; installed `node_modules/.pnpm/@modelcontextprotocol+sdk@1.31.0_zod@4.6.5`                                                                                               | matches                     |
| Protocol `2025-11-25` | `CLAUDE.md:628`, `AGENTS.md:610`; installed SDK `dist/esm/types.js:2` `LATEST_PROTOCOL_VERSION = '2025-11-25'`                                                                                    | accurate for the SDK in use |
| Latest v1 SDK         | `npm view @modelcontextprotocol/sdk dist-tags` gives `latest: 1.32.0` (released 2026-10-02)                                                                                                       | one minor behind            |
| Latest v2 SDK         | `npm view @modelcontextprotocol/server` gives `2.3.0`; `@modelcontextprotocol/server@2.0.0` was released 2026-07-27 ([releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)) | one major behind            |
| Current spec          | [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)                                                                                                        | one revision behind         |

**#4485 says 2026-07-28 support is "blocked on the SDK". That is no longer true.**
SDK v2 implements the revision. Its server bundle exports `DiscoverRequest`,
`UnsupportedProtocolVersionError`, `PROTOCOL_VERSION_META_KEY`, `subscriptions/listen`
types and `inputRequired` (MRTR), and it ships a migration guide,
`docs/migration/support-2026-07-28.md` (fetched with `gh api`). The 1.x line still
has no 2026-07-28 support.

**#4485's trigger can never fire.** Its trigger is "watch for `LATEST_PROTOCOL_VERSION`
= 2026-07-28". The v2 core still declares `LATEST_PROTOCOL_VERSION = "2025-11-25"`
(`@modelcontextprotocol/core@2.3.0`, `dist/auth-*.mjs`), because that constant names
the newest handshake-era revision. The real signal is the v2 package line itself.

**What changed in 2026-07-28 that affects us** (all from the changelog above):

- The handshake is gone: requests carry the version in `_meta`, and `server/discover` is a MUST (SEP-2575). Sessions are removed as well (SEP-2567).
- `list_changed` notifications are delivered over an opt-in `subscriptions/listen` stream (SEP-2575).
- Tasks move out of core into the `io.modelcontextprotocol/tasks` extension. `tasks/result` and `tasks/list` are removed in favour of polling `tasks/get` (SEP-2663).
- MRTR (`InputRequiredResult`) replaces server-initiated `roots/list`, `sampling/createMessage` and `elicitation/create` (SEP-2322).
- Roots, Sampling and Logging are deprecated, with a removal window of at least 12 months (SEP-2577). `logging/setLevel` is removed from the wire.
- `outputSchema` may use any JSON Schema 2020-12 keyword, and `structuredContent` may be any JSON value (SEP-2106).

**What 1.31.0 → 1.32.0 changed that affects us** ([1.32.0 notes](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/1.32.0)):
`InMemoryTaskStore` now keeps each task within the session that created it (PR #2925),
which is the store `src/mcp/task-store.ts:14` wraps. The release also adds an opt-in
`maxToolInputElements`.

## 2. Hand-rolled features against what the protocol and SDK now cover

### 2a. outputSchema derivation (#5134, #5066)

- **SDK:** no SDK version links the declared `outputSchema` to the handler's return type.
  - In v1.31, the `registerTool<OutputArgs, InputArgs>` callback is `ToolCallback<InputArgs>` and returns a plain `CallToolResult` (`dist/esm/server/mcp.d.ts:150-157,261`).
  - v2 2.3.0 is the same (`createMcpHandler-*.d.mts:3372-3382,3539`). v2 accepts any Standard Schema and deprecates the raw-shape form (`:3383`), but nothing type-checks the callback's `structuredContent`.
- **The root cause is not "hand-maintained", and this was measured.** The SDK checks the output one way and advertises it another:
  - The SDK advertises `outputSchema` through Zod `toJSONSchema(..., io: 'output')`, which emits `additionalProperties: false` for `z.object` (`mcp.js:88-95`).
  - The server's own check is a non-strict Zod `safeParse` (`mcp.js:186-205`). It silently strips extra keys and passes.
  - A probe against the installed SDK confirmed this: `{a, extra}` passes the server, while the advertised schema forbids `extra`.
  - Only a client running Ajv over the advertised JSON fails (`client/index.js:475-488`). v2 behaves the same way (`mcp-*.mjs:1820-1826`). With zod 4.6.5, the v2 conversion path (`~standard.jsonSchema.output`) still emits `additionalProperties: false`.
  - v2's guide says "no `additionalProperties: false` by default", but it is describing the generated `inputSchema` (`upgrade-to-v2.md:1517-1521`).
- **Today:** 18 tool modules declare `outputSchema` (`grep -lE "outputSchema(,|:)" src/mcp/tools`). They return through `toolSuccessStructured(data: Record<string, unknown>)` (`src/mcp/tools/tool-result.ts:106`), which is untyped, so the compiler sees no link between schema and return. The only guard is the SDK-`Client` round-trip suite (`src/mcp/mcp-standalone-tools.test.ts:149,196`), and it can only check response shapes it actually exercises (#5066).
- **Recommendation: build, small.** No SDK feature exists to adopt. The cheapest step that removes the class has two parts:
  1. Declare output schemas with `z.strictObject` (or `.strict()`), so the server's own `safeParse` fails exactly where the advertised schema does. Every handler-level test then catches an undeclared key without needing a protocol round-trip.
  2. Add a typed `toolSuccessStructured<S>(schema: S, data: z.output<S>)` so drift is a compile error.

  `consensus-vote.test.ts:1785` already uses `.strict()` this way in a test. Doing it for the other 17 schemas is mechanical.

### 2b. listChanged (#5132)

- **SDK:** already present in the 1.31 SDK we run.
  - `McpServer` registers `tools: { listChanged: true }` as soon as the first tool is registered (`mcp.js:62-66`). We already advertise the capability.
  - Every `RegisteredTool` has `enable()`, `disable()` and `remove()`, each of which emits `sendToolListChanged` (`mcp.js:605-651`). `tools/list` filters on `enabled` (`mcp.js:67-69`).
  - In v2, `send*ListChanged()` is routed onto `subscriptions/listen` automatically (`support-2026-07-28.md:612-621`).
- **Client:** Claude Code re-fetches tools on `list_changed` ([docs](https://code.claude.com/docs/en/mcp)). That fixes [anthropics/claude-code#77314](https://github.com/anthropics/claude-code/issues/77314), closed 2026-07-18, and [#79826](https://github.com/anthropics/claude-code/issues/79826), closed 2026-08-15.
- **Today:** no `enable()`, `disable()` or `sendToolListChanged` call appears anywhere under `src/` (grep). We advertise a capability we never exercise.
- **Recommendation: needs a decision, and the objection is weakened.** #5132's strongest counter was "registration is fixed". The SDK makes it dynamic in one call per tool, and the main client honours it. A transient prerequisite can call `disable()` at boot and `enable()` when the adapter resolves.

  Keep the actionable-error requirement for the `disabled` window. A hidden tool still gives the operator no reason. Consider exposing that reason through a diagnostic tool such as `doctor`.

  Smallest step: a spike on one tool (`run_workflow`) behind a flag, plus a round-trip test that asserts the `list_changed` notification and the re-listed set.

### 2c. Tasks vs `runAsJob` (#4978)

- **Spec/SDK:** the 2025-11-25 tasks primitive that `execute_expert` uses is **removed from SDK v2**. The removed surface includes `registerToolTask`, `InMemoryTaskStore`, the `taskStore` constructor option and `experimental.tasks.*`, and there is "no mechanical migration; remove usages" (`upgrade-to-v2.md:1754-1770`). The spec moved tasks to an extension with different semantics (SEP-2663). v2 serves it only through explicit-schema `setRequestHandler('tasks/get', …)` (`support-2026-07-28.md:357-366`).
- **Today:**
  - `execute_expert` uses `server.experimental.tasks.registerToolTask` (`src/mcp/tools/execute-expert.ts:682-696`) and sits outside the standard middleware stack (`:659-665`).
  - The server declares `capabilities.tasks` and passes `taskStore` (`src/mcp/server.ts:113-119`), and `src/mcp/task-store.ts` is 138 lines.
  - About 10 tools use `runAsJob` (`src/mcp/jobs/run-as-job.ts`, 608 lines). The non-test `src/mcp/jobs/` tree is about 2,900 lines.
- **Recommendation: needs a decision, and the vote should now favour keeping the job surface.** Any v2 upgrade forces #4978: the tasks lane goes away. Converging `execute_expert` onto `runAsJob` would:
  - remove the only tool outside the middleware stack,
  - close the unshared-limiter gap,
  - delete `task-store.ts` and the `tasks` capability.

  Exposing jobs through the new tasks extension is a separate, later call. No consumer needs it today, and the extension is not in the SDK runtime.

### 2d. Deprecated surfaces (#4485)

- **Logging:** already migrated. Operator events go to stderr (`src/mcp/mcp-notifier.ts:21,50-63`; commit `9ca0e0b3b2`, #6947), and no `sendLoggingMessage` call remains in `src/` (grep). Tick #4485 part 2a.
- **Roots:** still load-bearing. `src/mcp/workspace-roots.ts:174` calls `server.server.listRoots()`.
  - Claude Code now sets `CLAUDE_PROJECT_DIR` in the spawned server's environment as "the stable project root" ([docs](https://code.claude.com/docs/en/mcp)).
  - That is a server-configuration channel of the kind SEP-2577 recommends, and it is synchronous, which also removes the #4002 pre-resolution race. No `src/` code reads it today (grep).
  - **Recommendation: adopt** `CLAUDE_PROJECT_DIR`, then `NEXUS_DATA_DIR`, ahead of `roots/list`. Keep `roots/list` as the fallback until the 2027-07-28 removal window.
- **Sampling, HTTP+SSE:** not used (#4485 "checked and not affected" still holds).

### 2e. Other primitives

| Primitive              | Ours                         | Evidence                                                                                                |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Progress               | implemented                  | `src/mcp/mcp-notifier.ts:102-106` (`progressToken`, `sendNotification`)                                 |
| Cancellation           | implemented (request-scoped) | `src/cli-server-shutdown.ts:43` (`extra.signal`); jobs add their own abort registry (#4978)             |
| Prompts / resources    | implemented                  | `src/cli-server-tools.ts:977-978`                                                                       |
| Resource subscriptions | absent                       | no `subscribe` handler under `src/mcp/resources` (grep)                                                 |
| Elicitation            | absent                       | no `elicitInput` in `src/` (grep). Under 2026-07-28 this becomes MRTR `inputRequired`, which is v2-only |
| Sampling               | absent                       | see 2d                                                                                                  |

## 3. Client-behaviour assumptions

- **Spec:** "Servers **MUST** provide structured results that conform to this schema. Clients **SHOULD** validate" ([tools spec, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). The #5134 schemas therefore broke a server MUST. Client validation is optional, so "works in our harness" proves nothing.
- **SDK `Client`:** validates `structuredContent` with Ajv (`client/index.js:475-488`).
- **Claude Code:** whether it validates `structuredContent` is **UNVERIFIED**. Its MCP docs do not say, and #5134's observation of "no validation" is the only evidence.

## Summary

| Feature                 | Spec / SDK status                              | Ours                                              | Closes                   | Call                                          |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------ | --------------------------------------------- |
| Protocol 2026-07-28     | current spec; SDK v2 only                      | 2025-11-25 on v1.31                               | #4485 part 1             | needs decision (v2 major upgrade)             |
| SDK 1.32.0              | latest v1                                      | 1.31.0                                            | —                        | adopt (patch-level risk)                      |
| outputSchema derivation | not in SDK v1 or v2                            | hand-listed and untyped; strip-vs-strict mismatch | #5134 class, #5066 class | build: `strictObject` and a typed helper      |
| `listChanged`           | SDK `enable`/`disable`; Claude Code honours it | advertised, never used                            | #5132                    | needs decision (spike on one tool)            |
| Tasks                   | removed from SDK v2; spec extension            | `execute_expert` only                             | #4978                    | needs decision (lean: converge on `runAsJob`) |
| Logging                 | deprecated                                     | migrated to stderr                                | #4485 2a                 | done; tick it                                 |
| Roots                   | deprecated                                     | load-bearing `listRoots`                          | #4485 2b, #4002          | adopt `CLAUDE_PROJECT_DIR` first              |
| Elicitation / MRTR      | v2-only                                        | absent                                            | —                        | keep absent (no consumer)                     |
| Resource subscriptions  | replaced by `subscriptions/listen`             | absent                                            | —                        | keep absent                                   |
