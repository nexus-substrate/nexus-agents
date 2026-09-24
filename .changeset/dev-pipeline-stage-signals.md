---
'nexus-agents': patch
---

`run_dev_pipeline`: the research, quality-gate and security-scan stages now stop their work when the stage's deadline passes or the job is cancelled (#6747). Before, the stage failed on time but its work kept running behind the failure.

- **Quality gate:** the typecheck, lint and test scripts are ended together with every process they spawned: SIGTERM, then SIGKILL after 5 s for any process that ignores it. The 120 s per-check timeout, which `run_quality_gate` shares, now ends the whole tree too. Before, it killed only the package manager and left the script's processes running.
- **Security scan:** semgrep's process tree is ended the same way, and the OSV dependency lookups in flight are cancelled. The scan's 5-minute timeout also ends the whole tree now.
- **Research:** the source fetch in flight is cancelled, and no further source is queried.
- An aborted stage reports a timeout when the stage deadline fired, or `Dev pipeline cancelled during the <stage> stage` for a cancel. It records no outcome, and the research stage no longer continues on minimal context after an abort.
