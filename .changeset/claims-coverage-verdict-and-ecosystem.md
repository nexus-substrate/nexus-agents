---
'nexus-agents': patch
---

fix(governance): register ECOSYSTEM.md's tool count and migrate the coverage verdict (#5309)

Two follow-ups from the #5307 ratification panel, plus a live drift found while
checking whether the second one mattered.

## The drift, found by measuring instead of reasoning

Item 2 asked whether `SCANNED_DOCS` should be discovered rather than declared.
The scope steward's framing was "acceptable now, worth revisiting if the doc set
grows." Rather than opine, I ran the coverage patterns across every markdown
file in the tree:

```
25 docs say "47 MCP tools"   (correct — matches the manifest)
 1 doc  says "46 MCP tools"  ← ECOSYSTEM.md, live and stale
 1 doc  says "45 MCP tools"  ← CHANGELOG (historical, correct as written)
 3 docs say "42 MCP tools"   ← CHANGELOG + docs/archive (historical)
```

`ECOSYSTEM.md:23` was carrying a stale count that no gate could see, because
only `README.md` and `ARCHITECTURE.md` are scanned. Corrected to 47, and the doc
is now **registered and scanned** so it cannot drift again silently.

This is the second occurrence of exactly this failure: `npm-readme-tool-count`
exists in the registry because `packages/nexus-agents/README.md` had drifted to
"42 MCP tools". Two independent docs drifting the same way is the argument for
registering the count wherever it is stated, rather than only where someone
remembered to look.

Adding a doc to `SCANNED_DOCS` requires a registry entry with a matching
`subject`, since `isCovered` keys on it. That cost is deliberate: policing a doc
means committing to verify its claims, not merely noticing them.

## Item 1 — verdict migrated to the canonical surface

`checkCoverage`'s hand-rolled `uncovered.length === 0 && docsMissing.length === 0
&& docsScanned > 0` now goes through `verdictOver` from
`utils/verdict-aggregation`. The point is not brevity — it is that `whenEmpty` is
a **required** parameter, so "what does zero scanned docs mean?" cannot be left
to a language default the way a bare `uncovered.length === 0` would be.

`docsScanned` became a collected `docsRead` array so the verdict is expressed as
an aggregation _over the docs actually read_; the report still exposes a count,
so the public shape is unchanged.

Mutation-verified, per the rule's own caveat that the empty-input **test** is
what catches this class rather than the helper: flipping `whenEmpty` to `true`
fails 2 tests, including the empty-declared-list case. All 14 existing tests kept
and passing.

## Item 2 — discovery deliberately NOT implemented

Discovery over all markdown needs an **exclusion list first**. `CHANGELOG.md` and
`docs/archive/` legitimately carry counts that were true when written — the 42/45
hits above are all historical. Failing the build on those would make the gate
wrong rather than thorough. Recorded in the `SCANNED_DOCS` doc comment so the
next reader inherits the measurement rather than repeating it.
