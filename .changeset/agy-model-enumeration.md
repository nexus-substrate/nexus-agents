---
'nexus-agents': patch
---

fix(adapters): the gemini arm enumerates agy's models, not Google API ids

`GeminiCliAdapter.listModels()` returned `listModelsForCli('gemini')` — the
models.dev `google` vendor, 82 Google **API** ids like `gemini-2.5-flash`. That
arm spawns `agy`, which accepts none of them. The same reasoning already
documented for `cliModelName` in `config/agy-model-map.ts` applies to
enumeration: one field cannot serve both the API adapter and the CLI transport.
It now reports `AGY_MODEL_SLUGS`.

`agy models` is enumerable non-interactively again. #4393 recorded it hanging
90s without a TTY on v1.1.11; on v1.1.21 it completes piped in ~1s, exit 0. That
was an upstream defect and it is fixed.

With enumeration available, `AGY_MODEL_SLUGS` was verified against the live CLI
and gained the `gemini-3.7-flash-{high,medium,low}` family it had been missing
since it was last checked against v1.1.9. `scripts/check-agy-model-drift.ts`
compares the two so it cannot silently rot again — operator-invoked, since no CI
runner has the binary, and it reports `unmeasured` (a failure) rather than
passing when it cannot probe.

Claude and GPT-OSS slugs agy also fronts stay unmapped, per the 7/0 decision in
#4346; the check names them as excluded rather than dropping them silently.
