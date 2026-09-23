---
'nexus-agents': minor
---

New `nexus-agents model-drift` command: reports models that discovery sources list but the in-tree registry does not name, and registry models that no source lists any more. It proposes and never edits the registry or routing.

- **Sources.** The OpenAI-compatible gateway catalog (after the non-chat filter and `NEXUS_OPENAI_COMPAT_MODELS` allowlist), the Anthropic, OpenAI and Google list endpoints (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`), and the unauthenticated OpenRouter catalog. A source without credentials is reported `unmeasured` with the reason; a probe that throws is reported `failed`. Neither counts as "no new models".
- **Matching.** Dot and dash spellings (`claude-sonnet-4.6`), vendor prefixes (`anthropic/…`), `:free`-style tags and dated snapshots of a known model are not reported as new.
- **New models** come with a drafted registry entry: vendor, family, tier (flagship, mid, small or unknown, parsed from the id), context window, price in USD per 1M tokens and release date when the source publishes them, otherwise `unknown`. Non-chat models, vendors the registry does not track, `-latest` aliases and models older than 180 days are left out and counted.
- **Possibly retired** lists registry models no measured source lists, but only for vendors a measured source covers; the rest are listed as retirement-unmeasured.
- **Verdict.** `drift`, `no-drift`, or `unmeasured` when no source could be asked. `unmeasured` exits non-zero and is never reported as up to date.
- **Flags.** `--json` prints the report as JSON. `--file-issue` opens one GitHub issue per new model with `gh`, labelled `discovered`, deduplicated against open issue titles by model id, and at most 5 per run. Without `gh` nothing is filed and the drafts are printed.
- **Weekly workflow.** The parameter-drift workflow gains a report job that uploads `model-drift-report.json` as an artifact and fails when the report is unmeasured. Filing is off unless the repository variable `MODEL_DRIFT_FILE_ISSUES` is `true`; the filing job holds no model API keys.

The OpenRouter catalog parser now also keeps each model's `created`, `context_length` and `pricing`; a malformed value drops that field, not the model.
