---
'nexus-agents': patch
---

**fix(plugin):** marketplace.json now passes `claude plugin validate` (closes #2983).

Two schema violations the validator reported:

1. **Missing top-level `owner`** — the schema referenced by the `$schema` URL requires an `owner` object alongside `name`/`description`/`plugins`. Added with `name` + `url` pointing at the maintainer GitHub profile.

2. **`plugins[0].source` shape** — pre-fix used the `{ type: 'github', owner: 'williamzujkowski', repo: 'nexus-agents' }` triple. Schema-accepted form is `{ source: 'github', repo: 'williamzujkowski/nexus-agents' }` (single `repo` field with `owner/repo` slug, `source` key instead of `type`).

Both fixes are mechanical — values are derived from the existing data; no behavior change beyond the validator now passing.
