---
'nexus-agents': patch
---

test(config): pin what the audit default actually does

`SecurityConfigSchema` declares `audit.enabled: z.boolean().default(true)` and
its JSDoc says "default: true", but the enclosing `audit` object is `.optional()`
— so a config with no audit block parses to `audit: undefined`, the inner
default never fires, and `initializeAuditLogger` treats it as disabled.

The existing test parses `{ audit: {} }`, supplying a key a real deployment never
writes, so it asserts the declared intent rather than the production result.

Adds a sibling that parses `{}` and pins the actual shape, and a comment on the
original explaining what it does and does not cover. Characterization only — no
behaviour change, and deliberately not an endorsement of either resolution in
#4768.

Useful for whoever implements that fix: making the default real (`.default(() =>
({}))`) fails BOTH this new test and `parses valid security config with
defaults`, so the change is one line with two deliberate test updates.
