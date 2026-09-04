---
'nexus-agents': patch
'nexus-memory': patch
---

fix(cli): make the node:sqlite warning filter actually fire (#5392)

8.0.0 shipped a filter for the `node:sqlite` ExperimentalWarning that **could
never work**. Found by running the published package rather than by reading it:

```
$ npm install --ignore-scripts nexus-agents@8.0.0
$ nexus-agents doctor
(node:57467) ExperimentalWarning: SQLite is an experimental feature and might change at any time
✓ SQLite (node:sqlite): Available
```

Three facts compose into the defect, and only the third was missed:

1. Node emits this warning at **import** time, not first use.
2. The bundler **hoists** `import { DatabaseSync } from 'node:sqlite'` to the
   top of the emitted chunk, where it evaluates before any code in the package.
3. So a suppressor invoked as a statement in `cli.ts` — or even imported for
   side effects — ran strictly **after** the warning had already printed.

`open-database.ts` now loads `node:sqlite` through `createRequire`, which keeps
the load **synchronous** (the property that made `node:sqlite` a drop-in for
better-sqlite3 in the first place, since `MobiMem`'s constructor is sync) while
deferring it past filter installation. Node caches the module, so repeat calls
cost nothing. Applied in both packages — `nexus-agents` bundles `nexus-memory`,
so the hoisted import in either one defeats the filter.

Verified on the built artifact: `nexus-agents doctor` now emits **0** warnings
on stderr and still reports `✓ SQLite (node:sqlite): Available`.

## Why the tests did not catch it

Every unit test of the filter passed while the filter was useless, because each
one installed the filter and _then_ raised a warning by hand. The property that
actually mattered was the **import shape**, which no test asserted.

Two checks now pin it:

- `sqlite-import-shape.test.ts` fails if any source file imports `node:sqlite`
  statically as a value.
- `verify-npm-install.sh` Phase 8 asserts the built CLI leaks no
  experimental-SQLite warning to stderr — the artifact, not the source.

The first version of that guard **was itself defective**, and mutation testing
caught it: it tested per FILE for a value import _and_ the absence of a type
import, so a file containing both — which `open-database.ts` legitimately does —
reported clean, and reintroducing the exact bug passed. It classifies per LINE
now. Reintroducing the static import fails the guard; a type-only import does
not, and a file with both is still reported.
