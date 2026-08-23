---
'nexus-agents': patch
---

chore(ops): drop two `$schema` declarations that pointed at the JSON Schema meta-schema

`docs/ops/docops-manifest.json` and `docs/architecture/wiring-graph.json` declared `"$schema": "https://json-schema.org/draft/2020-12/schema"`. Neither is a JSON Schema — both are plain data manifests (`version`, `description`, `pipeline_files`, `metadata`). That declaration tells an editor to validate the document _as a schema_, and since JSON Schema permits arbitrary keywords the editor silently accepts anything: validation reporting success having checked nothing.

Found while sweeping #4612, which reported one dangling `$schema`. There are five broken declarations in total, all on files this repo owns; the other eleven, every one pointing at a third-party tool schema, are correct.

Only these two are changed here. A 3-voter panel split 1-1-1 on what to do with the three _dangling_ relative references — write schemas, generate them from the TypeScript validators, or delete the lines — so that stays open on #4612 for a decision. All three options agreed these two references are wrong, and deletion is the safe intersection: if schema generation is chosen later, it adds a correct reference anyway.
