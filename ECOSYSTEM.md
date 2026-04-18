# Nexus Agents Ecosystem

Companion repos in the nexus-agents ecosystem, discoverable via GitHub topics.

## Quick Find

```sh
# Canonical E2E test projects exercising MCP tools
gh search repos --owner williamzujkowski --topic nexus-agents-test

# Showcase / demo projects built on nexus-agents
gh search repos --owner williamzujkowski --topic nexus-agents-demo

# Sibling projects that integrate with nexus-agents
gh search repos --owner williamzujkowski --topic nexus-agents-companion
```

## Test Projects (`nexus-agents-test`)

Each exercises a specific subset of the 30 MCP tools end-to-end. Intended as regression harness — if a tool's contract changes, the corresponding test repo should fail.

| Repo                                                                         | Tools Under Test                                                                          | Description                                              |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [nexus-toolkit](https://github.com/williamzujkowski/nexus-toolkit)           | `orchestrate`, `research_catalog_review`, `registry_import`                               | E2E test suite for the core MCP tools                    |
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

### Adding a new repo to the ecosystem

1. Apply the appropriate topic:
   ```sh
   gh repo edit owner/repo --add-topic nexus-agents-test  # or -demo, -companion
   ```
2. Ensure the repo has a `pnpm test` (or equivalent) entry point for smoke testing.
3. Open a PR adding a row to the appropriate table above.

---

_Last updated: 2026-04-18. Maintained alongside nexus-agents releases._
