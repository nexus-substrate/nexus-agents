---
'nexus-agents': patch
---

docs: establish `run` as the default MCP entry point

Documents `run` as THE default way to drive nexus-agents (give a goal → MetaOrchestrator selects, and with `execute: true` runs, the right strategy) and frames the specialized pipeline tools (`run_dev_pipeline`, `run_pipeline`, `run_graph_workflow`, `orchestrate`, `execute_spec`, `consensus_vote`, `delegate_to_model`) as advanced force-strategy paths — de-emphasized but fully callable. Completes the demotion condition from the MetaOrchestrator design vote. Increment B slice (d) / closes the functional scope of the run entry point (#3575).
