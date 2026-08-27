---
'nexus-agents': patch
---

fix(mcp): one request context and one audit pair per tool call

Every MCP tool call ran through two middleware implementations that each minted
their own `RequestContext`, so one call produced two unlinked `req_*` ids and
two `Tool invocation started` / `Tool execution completed` pairs. Log-derived
call counts were 2x, and an id from one layer's log line could not reach the
other layer's lines for the same call.

They were not merely unlinked but unlinkable: `createRequestContext` accepts
`traceId` / `parentSpanId`, neither caller passed them, there is no
`parentRequestId`, and the chain's only AsyncLocalStorage held the AbortSignal.

Argument threading could not fix it. `createSecureHandler` returns a 1-arity
function, so the chain's arity dispatch drops `ctx` before the inner layer ever
sees it, and some tools place a 1-arity prerequisite wrapper between the two
layers. The chain now publishes its context ambiently — mirroring the AbortSignal
and progress storages it already uses — and the secure handler adopts it instead
of minting a second one.

The inner start/complete pair is suppressed when a chain context is present. The
outer pair is the one kept: it is second-outermost in the stack, so its duration
spans validation, rate limiting, policy and timeout as well as the handler,
whereas the inner completion timed only the handler body. The inner pair was also
incomplete — every pre-check rejection returned before it, logging a start with
no matching completion.

Adoption is gated on the tool name matching, so an in-process nested tool call
does not inherit its parent's request identity, and on an ambient context
existing at all, so composing a secure handler without the chain is unchanged.

Audit-logger records now carry the surviving id, which is what makes them
joinable to the log lines for the same call. Rows written before this change
correlate to an id that no longer appears in logs; nothing joins across the two,
so there is no live breakage.

Also corrects a doc comment on `execute_expert`, the one tool of 46 outside the
standard stack, which claimed it used `createSecureHandler` and carried the #271
timeout protection. It registers through `registerToolTask` and does neither.
