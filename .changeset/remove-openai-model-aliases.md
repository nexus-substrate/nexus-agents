---
'nexus-agents': major
---

Remove `OPENAI_MODEL_ALIASES` and automatic model alias rewriting from
`OpenAIAdapter` and `createOpenAIAdapter` in 11.0. The constant is no longer
exported from the package or its adapter barrels. Completion and streaming
requests now send the configured `modelId` unchanged.

To keep requesting the same model, replace each former alias with its exact
canonical model ID:

| Removed alias     | Canonical model ID previously requested |
| ----------------- | --------------------------------------- |
| `gpt-5.2-instant` | `gpt-5.2-chat-latest`                   |
| `gpt-4o`          | `gpt-4o-2024-11-20`                     |
| `gpt-4o-mini`     | `gpt-4o-mini-2024-07-18`                |
| `gpt-4-turbo`     | `gpt-4-turbo-2024-04-09`                |
| `gpt-3.5-turbo`   | `gpt-3.5-turbo-0125`                    |

Remove imports of `OPENAI_MODEL_ALIASES` and use the canonical strings above or
the corresponding existing `OPENAI_MODELS` constants. Update `modelId` in
adapter construction, defaults, and configuration files. For example,
`modelId: 'gpt-4o'` becomes `modelId: 'gpt-4o-2024-11-20'`.

Former alias names and unknown model IDs pass through unchanged; the adapter
does not raise a local unknown-model error. The bundled model registry has no mapping
from these names to the former canonical targets: its catalog treats four as
independent upstream IDs, and `gpt-5.2-instant` has no authoritative entry.
Inventing a mapping for an error would retain the removed alias table. The
configured endpoint decides whether a submitted ID is supported, and its
errors are returned through the adapter's normal error handling. Passing a
former alias can therefore request a different upstream model unless migrated.

`verbatimModelId` remains accepted as a compatibility no-op: both `true` and
`false` send the supplied ID unchanged. Gateway IDs already sent verbatim,
provider catalog identities, and other providers' alias handling are unchanged.
