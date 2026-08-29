---
'nexus-agents': minor
---

fix(mcp): stop run_workflow reporting success for steps that never ran

When no model adapter resolved, the workflow engine was silently opted into mock
execution, and `run_workflow` returned `status: 'success'` with "Executed step X
with action Y" for every step — an unexecuted workflow reported as succeeding.

Scope, corrected after review: `--mode=server` was NOT affected.
`resolveDefaultModelAdapter` returns a non-optional adapter, so the fallback was
unreachable there. It bites embedders that call `registerMcpTools` or
`registerRunWorkflowTool` without a `modelAdapter` — which is exactly what the
new seam test exercises. An earlier draft of this changeset claimed a fresh
install with no API key was affected; that was wrong.

Fixed by splitting the engine along its actual capability boundary, per a 6/6
panel decision (#5116). Enumerating templates needs no model adapter;
executing them does. `list_workflows` and run_workflow's own template
resolution keep a listing engine that is constructible without credentials,
while the executing engine is resolved at call time and surfaces
`WorkflowExecutionUnavailableError` as an actionable tool error.

`resolveExecutionEngine` is a required thunk rather than an optional value. A
thunk because constructing an executing engine throws under the #507 fail-safe,
and doing that eagerly at tool registration took down all 47 tools over one
unconfigured adapter. Required because an optional field with a fallback would
let a future call site silently inherit the listing engine and execute against
its unreachable mock executor — the exact defect being fixed.

The #507 contract and its five construction-throw tests are unchanged.

Released as a **minor**: `RunWorkflowDeps` gains an optional `resolveExecutionEngine`,
and the API-surface gate classifies an additive optional field as minor for readers.
It was briefly required — which is how the compiler enumerated all eight internal call
sites — but a unanimous panel chose optional-with-default, because keeping it required
would make a publicly exported type breaking and gate a p1 correctness fix behind a
major version.
