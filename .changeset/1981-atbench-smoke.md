---
'nexus-agents': patch
---

ci(atbench): add fixture-based smoke workflow (#1981)

Adds an in-repo JSONL fixture (`test-fixtures/atbench-smoke.jsonl`)
and a `.github/workflows/atbench-smoke.yml` PR gate that exercises
`atbench info` and `atbench run --fixture=...` end-to-end against
the stub scorer. Stays offline (no HF, no LLM) and asserts the
stub oracle returns `5/5 passed` with `F1=1.000`.

Also wires the `--fixture` and `--llm-scoring` flags into
`PARSE_ARGS_CONFIG` and the top-level argv builder so they are
accepted by `nexus-agents atbench run`.
