---
'nexus-agents': patch
---

make `index diagram --output` name the diagram, not the index

On the `diagram` subcommand, `--output` set where the command READ its index
from and the diagram destination was hardcoded, so there was no way to aim the
generator at a repo's real docs location. That is why this repo's canonical
`docs/architecture/dependency-graph.md` carried a `Generated: 2026-01-12` header
no generator had touched in seven months.

`--output` now names the diagram destination. The default stays cwd-relative, so
a run inside another repository still writes into that repository's tree.

Also fixes the self-heal path: when the index is missing it regenerates one, and
it used to forward `--output` to the index generator — writing a multi-megabyte
YAML index over the diagram the caller asked for.

Fixes #4799.
