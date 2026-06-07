---
'nexus-agents': patch
---

fix(consensus): restore full voter panel + warn on degradation (#3587)

Two fixes for silent panel shrinkage. (1) Root cause: a voter round-robined onto
a diverse CLI backed by an OpenRouter model without tool-use hard-fails ("no
endpoints that support tool use") and the responseFormat retry can't help (the
CLI sends bash tools regardless) — so that voter silently dropped. The voter
launcher now retries once on the known-good fallback adapter when a diverse
adapter fails (non-deadline), keeping the panel at full strength while preserving
CLI diversity when it works. (2) Observability (#3587 scope): the consensus
response now carries a `panelWarning` when some-but-not-all voters errored, so a
degraded panel is visible rather than passing silently on the survivors.
