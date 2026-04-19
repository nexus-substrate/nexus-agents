---
'nexus-agents': minor
---

feat(benchmarks): add ATBench skeleton adapter (#1981 partial)

Tier 1 (score-only) skeleton of ATBench — trajectory safety benchmark
from arxiv-2604.14858. Public dataset:
https://huggingface.co/datasets/AI45Research/ATBench-Claw

Lands the `BenchmarkAdapter` contract implementation with deterministic
stub scorer so the pipeline works end-to-end before the LLM classifier
integration arrives. Follow-up adds HF dataset loader + real security-
expert scorer per the vote-approved design (#1981).

**New exports from `nexus-agents/benchmarks`:**

- `ATBenchAdapter` — implements BenchmarkAdapter contract (load/run/evaluate/isPass/summarize)
- `scoreTrajectoryStub()`, `classifyConfusion()` — scorer helpers
- `ATBenchTrajectory`, `ATBenchPrediction`, `ATBenchEvalResult`, `SafetyLabel`, `SafetyTaxonomy`, `ToolEvent` types + Zod schemas

**Fixture-based for now.** `loadInstances` requires `config.fixturePath` pointing at a JSONL file; HF download path is the follow-up.

**Scoring math is real.** Tier 1 stub is a perfect oracle (echoes ground truth) to exercise the contract deterministically, but precision/recall/F1/confusion-matrix computation is production code.

15 tests pass covering:

- confusion classification (tp/tn/fp/fn)
- fixture loading (+ maxInstances cap, missing-path error)
- adapter contract (name, variant, runInstance, evaluate, isPass)
- summarize math (precision/recall/F1, empty-results zeros)
