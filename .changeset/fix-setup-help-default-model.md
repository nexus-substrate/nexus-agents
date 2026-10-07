---
'nexus-agents': patch
---

`nexus-agents setup --help` now names the model `--custom-model` actually defaults to. The help text said `gpt-4o`, but `setup --custom-api` has used `CUSTOM_API_DEFAULT_MODEL` (currently `gpt-5.5`) when `--custom-model` is omitted. The help line now reads that constant, so it cannot drift from the real default again. Behavior is unchanged; only the help text was wrong.
