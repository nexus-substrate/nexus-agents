---
'nexus-agents': patch
---

fix(adapters): the failover signal now names the adapter that failed

`applySelection` overwrote `this.health` with the incoming adapter's
`state: 'healthy'`, and `emitFailover` then read it — destroying the outgoing
state one statement earlier. Every `adapter.failover` payload therefore reported
healthy, `unhealthyCliFrom` returned `undefined` for all of them, and
`signal.swarm_unhealthy` was never produced by this path. Its sibling producer
still worked, but the module's own docs call that one less reliable, so the
reliable arm was the dead one.

The payload now describes the adapter that was left, which is what the consumer
means by "which CLI is unhealthy". `failoverCount` is a run-level counter rather
than a property of that adapter, so it carries the post-increment value.

An unknown outgoing state emits nothing rather than falling back to the current
health: the fallback would silently restore the old behaviour, and a failover
whose prior state cannot be described is not evidence the prior adapter was
healthy.
