---
'nexus-agents': patch
---

Give the adapter registry a designated composition root (#6012)

`getGlobalRegistry(config)` applies its config only on the FIRST call and warns
on every later one — correctly, since it did discard the input. But nine call
sites passed `{ logger }` and nothing claimed the registry deliberately, so the
registry's logger was fixed by whichever of the nine ran first, and the other
eight emitted a "provided config ignored" warning on the SUCCESS path of
`nexus-agents vote`.

The nine sites now call `getGlobalRegistry()` bare, and the registry is claimed
once per process at `cli.ts` `main()` and `mcp/server.ts` `connectTransport()`
via a new internal `claimGlobalRegistry(logger)` — idempotent and silent when
already claimed. Idempotence is load-bearing: both roots run in
`nexus-agents --mode=server`, and a warn-on-second-claim helper reintroduced the
exact noise this removes (measured on the built binary before it was fixed).

This does NOT provide per-caller log attribution — the singleton has one logger,
and per-caller attribution would require passing one per operation. What it buys
is that the one logger is a deliberate choice rather than a consequence of call
order, and that successful runs stop emitting a warning nobody can act on.

Measured on the built binary, each with a positive control so a zero is not
vacuous: `vote --quick` 1 warning → 0 (vote completed, audit record written);
`--mode=server` 1 → 0 (server started successfully).

`claimGlobalRegistry` is internal — it does not appear in the published API
surface, and `getGlobalRegistry` is unchanged. Also drops two parameters the
change left unused (`resolveAdapter`'s and `createCliAdapterMap`'s `logger`),
neither published.

Ratified by a 7-voter panel at supermajority (6 approve / 1 reject, option C
unanimous among approvers).
