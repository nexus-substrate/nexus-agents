---
'nexus-agents': minor
---

`GraphBuilder.addNode` accepts `gotoTargets`, so `Command.goto` can reach a node that has no static edge (#5727)

`Command.goto` lets a node redirect the next runnable set to a target instead of
resolving its static edges. But `compile()` rejected the graph first whenever the
target was reachable only through the goto: `checkReachability` walks a BFS over
the static edge set, and a node with no inbound edge is not in it. So the feature
only ever worked among nodes that were already statically reachable — much
narrower than it reads.

The executor half already handled dynamic targets (it looks the target up and
warns-and-drops an unknown one); the builder had no way to declare one. Now it
does, mirroring LangGraph's `ends`:

```ts
builder.addNode('classify', handler, { gotoTargets: ['escalate'] });
```

Declared targets are traversed from the DECLARING node, exactly like an edge —
not seeded from START. That keeps `unreachable_node` able to fail: an orphaned
subgraph whose nodes name each other as goto targets is still rejected, where
seeding would have let it mark itself reachable. An undeclared orphan still
fails, and a declared target that is not a node fails as `missing_node`.

Additive: `gotoTargets` is optional, and the existing per-node options are now
the named `NodeOptions` interface (structurally unchanged). `GraphCompileError`
is deliberately NOT widened, so consumers switching exhaustively over it are
unaffected.

Ratified by a 7-voter panel at supermajority (6 approve / 1 reject, option 1
unanimous among approvers).
