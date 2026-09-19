---
'nexus-agents': patch
---

Remove expired `swe-bench` and `atbench` CLI subcommands and option parsers (#6442). These subcommands were deprecated shims pointing operators to `nexus-eval-swebench` and `nexus-eval-atbench`.
