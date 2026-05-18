# Nexus Agents Ecosystem

Companion repos in the nexus-agents ecosystem, discoverable via GitHub topics.

## Quick Find

```sh
# Canonical E2E test projects exercising MCP tools (org)
gh search repos --owner nexus-substrate --topic nexus-agents-test

# Standalone benchmark / evaluation harnesses (org)
gh search repos --owner nexus-substrate --topic nexus-agents-eval

# Showcase / demo projects built on nexus-agents (personal)
gh search repos --owner williamzujkowski --topic nexus-agents-demo

# Sibling projects that integrate with nexus-agents (personal)
gh search repos --owner williamzujkowski --topic nexus-agents-companion
```

## Test Projects (`nexus-agents-test`)

Each exercises a specific subset of the 38 MCP tools end-to-end. Intended as regression harness — if a tool's contract changes, the corresponding test repo should fail.

| Repo                                                                         | Tools Under Test                                                                          | Description                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [nexus-toolkit](https://github.com/nexus-substrate/nexus-toolkit)            | `orchestrate`, `research_catalog_review`, `registry_import`                               | E2E test suite for the core MCP tools                    |
| [model-showdown](https://github.com/williamzujkowski/model-showdown)         | `delegate_to_model`, `create_expert`, `execute_expert`, `consensus_vote`                  | Model comparison pipeline across all 5 voting strategies |
| [research-to-action](https://github.com/williamzujkowski/research-to-action) | `research_discover`, `research_add`, `research_analyze`, `consensus_vote`, `memory_query` | Research-driven decision pipeline                        |
| [workflow-runner](https://github.com/williamzujkowski/workflow-runner)       | `list_workflows`, `run_graph_workflow`, `query_trace`                                     | Workflow template E2E exerciser                          |
| [routing-oracle](https://github.com/williamzujkowski/routing-oracle)         | `delegate_to_model`, `weather_report`, `consensus_vote`                                   | Multi-model routing validator                            |
| [spec-factory](https://github.com/williamzujkowski/spec-factory)             | `execute_spec`, `query_trace`, `registry_import`                                          | AI software factory spec pipeline tests                  |
| [issue-sentinel](https://github.com/williamzujkowski/issue-sentinel)         | `issue_triage`                                                                            | Security / trust classification + injection detection    |
| [memory-bench](https://github.com/williamzujkowski/memory-bench)             | `memory_query`, `memory_stats`, `memory_write`                                            | Memory backend benchmarks                                |
| [pipeline-eval](https://github.com/williamzujkowski/pipeline-eval)           | `run_dev_pipeline`, `run_pipeline`                                                        | Pipeline evaluation harness with scoring rubrics         |

## Demo / Reference (`nexus-agents-demo`)

Full applications built on top of nexus-agents, demonstrating real-world usage patterns.

| Repo                                                                         | Demonstrates                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [repo-health-report](https://github.com/williamzujkowski/repo-health-report) | Multi-agent orchestration + consensus voting on real GitHub repos     |
| [siteprobe](https://github.com/williamzujkowski/siteprobe)                   | Standalone CLI derived from dogfooding the step-notifications pattern |

## Evaluations / Benchmarks (`nexus-agents-eval`)

Standalone benchmark harnesses implementing the `BenchmarkAdapter` contract from nexus-agents ≥2.33.1. Each is a runnable npm package with its own CLI; nexus-agents supplies the orchestrator (`runBenchmark`), types, and reporting surface.

| Repo                                                                                      | Benchmark                                                                                             | Pattern                                                         |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [nexus-eval-template](https://github.com/nexus-substrate/nexus-eval-template)             | Template scaffold — copy via GitHub "Use this template"                                               | `is_template=true` + topic `nexus-agents-eval-template`         |
| [nexus-eval-swebench](https://github.com/nexus-substrate/nexus-eval-swebench)             | SWE-bench Lite / Verified / Full — GitHub issue resolution                                            | v0.2 clean-room model-only baseline                             |
| [nexus-eval-swebench-pro](https://github.com/nexus-substrate/nexus-eval-swebench-pro)     | SWE-bench Pro — 731 multi-language instances (ScaleAI)                                                | v0.2 model-only baseline; Docker-eval = v0.4                    |
| [nexus-eval-aider-polyglot](https://github.com/nexus-substrate/nexus-eval-aider-polyglot) | Aider polyglot — multi-language code edits across 6 langs (Python/JS/TS/Go/Rust/C++)                  | v0.3 — agentic flow (read_file / write_file / run_tests)        |
| [nexus-eval-livecodebench](https://github.com/nexus-substrate/nexus-eval-livecodebench)   | LiveCodeBench — competitive-programming with deterministic hidden tests (LeetCode/AtCoder/Codeforces) | v0.3 — agentic flow (read_problem / write_solution / run_tests) |
| [nexus-eval-tau-bench](https://github.com/nexus-substrate/nexus-eval-tau-bench)           | TAU-bench — tool-use customer-service benchmark (airline + retail scenarios)                          | v0.3 — agentic flow (stub env); v0.4 = real grading             |
| [nexus-eval-atbench](https://github.com/nexus-substrate/nexus-eval-atbench)               | atbench — agent-trajectory safety                                                                     | v0.1 extracted from in-tree                                     |

New harnesses land here as they are extracted. To build one, start from the template: `gh repo create yourname/nexus-eval-<bench> --template nexus-substrate/nexus-eval-template --public`.

## Companions (`nexus-agents-companion`)

Sibling projects that either use nexus-agents or are designed to be used alongside it.

| Repo                                                                                                 | Relationship                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [deterministic-agent-runtime](https://github.com/williamzujkowski/deterministic-agent-runtime)       | Python runtime where the runtime owns control, not the LLM — companion pattern |
| [nexus-agents-skill-packs](https://github.com/williamzujkowski/nexus-agents-skill-packs)             | Reusable skill packs for domain workflows (CF, K8s, security)                  |
| [nexus-excalidraw-diagram-skill](https://github.com/williamzujkowski/nexus-excalidraw-diagram-skill) | Diagram-generation skill for Claude Code / any agent                           |
| [secure-language-stacks](https://github.com/williamzujkowski/secure-language-stacks)                 | Security toolchain reference — nexus-agents skills included                    |
| [adversary-lab](https://github.com/williamzujkowski/adversary-lab)                                   | Threat research feeding defenses into nexus-agents                             |

## How to integrate into nexus-agents CI

The `ecosystem-smoke` workflow (see `.github/workflows/ecosystem-smoke.yml`) periodically checks out each `nexus-agents-test` repo and runs its tests against the latest nexus-agents. Failures surface as issues on this repo with a `discovered` label.

`nexus-agents-eval` repos are NOT part of ecosystem-smoke by default — benchmark runs are too expensive/long-running for a weekly gate. Each eval repo owns its own CI (typically: unit tests in GitHub Actions + a smaller `--limit 5` smoke job; full benchmark runs are dispatched manually or on release).

### Adding a new repo to the ecosystem

1. Apply the appropriate topic:
   ```sh
   gh repo edit owner/repo --add-topic nexus-agents-test  # or -demo, -eval, -companion
   ```
2. Ensure the repo has a `pnpm test` (or equivalent) entry point for smoke testing.
3. Open a PR adding a row to the appropriate table above.

---

_Last updated: 2026-04-18. Maintained alongside nexus-agents releases._
