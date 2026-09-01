---
'nexus-agents': patch
---

fix(lint): close the dynamic-import gap in the createAllAdapters restriction (#5313)

#5313 said "nothing enforces that createAllAdapters is only used for router
construction". That is mostly false — `eslint.config.js` has banned it
repo-wide since #5191, with a router-construction exemption. What was true is
narrower and was documented in the config itself: `no-restricted-imports` cannot
see `const { createAllAdapters } = await import(...)`, and the config said
closing that "would need a bespoke rule, which epic #5121's constraint 1 says
not to build."

**That reasoning was wrong.** `no-restricted-syntax` is a stock ESLint rule and
`ImportExpression` is a standard ESTree node, so an esquery selector closes the
gap while honoring constraint 1 exactly — nothing bespoke is built. Verified: a
new dynamic import of the factory or the barrel now errors, as the static form
already did.

Two consequences fixed alongside it:

- **The router-construction exemption only turned off `no-restricted-imports`.**
  `pipeline/expert-bridge.ts` reaches `createAllAdapters` through a dynamic
  import, so exempting one rule would have left a ratified-legitimate call site
  failing lint.
- **The block called `createAllAdapters` "deprecated", contradicting the block
  50 lines below it** — #5191 ratified it as canonical for a different
  operation, and CLAUDE.md's canonical-paths table lists both. The rule's
  message also sent every reader to `getGlobalRegistry()`, which would misdirect
  someone doing legitimate router construction. Both now say that acquisition
  and router construction are different operations.

`mcp/tools/list-available-models-tool.ts:137` is the one genuine non-router call
site the new rule surfaces. It is warn-listed rather than exempted: a 7-voter
panel (audit record #138) compared it against the ratified doctor-probe
exemption and all five approvers landed on migrating it — doctor's consumer is a
human asking "is this CLI alive right now", while `list_available_models` is a
discovery surface consumed by agents choosing where to route, and for that
consumer an open breaker is signal rather than staleness. The migration changes
what the tool measures, so it needs its own change with tests and a description
update; the warning keeps it visible until then.
