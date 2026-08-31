---
'nexus-agents': patch
---

fix(security): the pre-tool gate fails closed on an unusable block pattern

`testCustomPattern` caught an invalid `RegExp` from `config.customBlockPatterns`
— an **operator-authored denylist** — and returned `false`, meaning "did not
match". `validateBashCommand` then returned `null` and `handlePreTool` fell
through to `allowTool()`.

So a single malformed regex silently disabled that rule and the command was
**allowed**, with a `HookResult` indistinguishable from *"evaluated against every
pattern and clean"*. The `logger.warn` went to the hook's own logger, not into
the result the caller acts on, so neither the client nor the audit trail of the
tool call recorded that a rule had been skipped. A bad regex is the single most
likely thing an operator gets wrong in this config.

`.rules/untrusted-input.md` invariant 5 is *"Fail closed. On ambiguity or
conflicting signals, refuse and escalate. Never guess."* — and the same repo
already does this correctly at `codepr-guards.ts:735`, where a throwing guard
returns `deny('guard_error', … '(fail-closed)')`.

`testCustomPattern` now returns `'match' | 'no-match' | 'invalid'`. Collapsing
the last two is what made an unusable rule read as a clean one. An invalid
pattern denies, and the reason **names the pattern and says it did not compile**
— an operator seeing "Blocked by custom pattern" would conclude their rule fired
rather than that it is broken, which is a different diagnosis and a different
fix.

An existing test named `should handle invalid regex patterns gracefully`
asserted `allow`, pinning the fail-open as intended behaviour.
