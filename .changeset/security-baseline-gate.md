---
'nexus-agents': minor
---

Compare development-pipeline security scans against the pipeline's pinned base commit, so existing critical and high findings no longer reject unrelated changes. Both trees use the same frozen scanner configuration and uncapped results. Stable parse diagnostics on byte-identical, untouched files are reported as explicit unscanned coverage; newly unparsable files, changed diagnostics, and edits to partially parsed files block the comparison. The gate compares occurrences by rule, file and normalized snippet; replacing an old occurrence with a new one still blocks, even when counts match. Severity escalations (including below high), missing snippets, incomplete scans and scanner or parser errors fail closed.

The stage result, pipeline result and run_dev_pipeline response now include the base SHA, base and worktree finding counts, introduced blocking count, and actionable blocking findings. An incomplete comparison blocks with unmeasured security status, unknown introduction counts, and no introduced findings. Results include the scanner version and unscanned-coverage list. Semgrep runs from a neutral directory to prevent worktree-controlled pyenv version selection, and scanner failure summaries filter incidental Python warnings before truncation.

Without a baseline, security gates assess findings and dependency vulnerabilities before reporting parse gaps: blocking findings still fail and are included in the result; a nonblocking scan with parse diagnostics reports unmeasured coverage and lists the unparsed files. Relative local rulesets resolve from the trusted server working directory in both scan paths, rather than from the scanned tree.
