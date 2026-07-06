---
'nexus-agents': patch
---

fix(context): cap two unbounded token sinks — extract_symbols full-mode + per-call context budget (#4253, epic #4251)

Phase-1 "stop the bleed" token-sink caps from the token-cost epic.

**A — `extract_symbols` full-mode output cap.** Full mode previously dumped
every matched symbol's entire source text with no cap, so a large file or
large match set could blow a token budget with no backpressure. It now caps
total emitted source at 20,000 chars / 200 symbols by default, overridable via
optional `maxChars` / `maxSymbols` input fields. The boundary symbol is
truncated with an ellipsis marker rather than silently dropped, and when
truncation happens the JSON output reports `truncated`, `omittedSymbols`, and
`omittedChars` so the cut is visible. Output is unchanged when results are
under both caps.

**B — per-call context budget guard in `summarizeContextForPrompt`.** The
assembled context block is now clamped to a token budget (default 2,500 tokens,
the CLAUDE.md "Standard" tier; overridable per call) on BOTH the ranked
(`NEXUS_CONTEXT_RANKED`) and legacy paths — the legacy path previously had no
budget at all, only per-section `.slice(0, 3-5)` count limits. When clamping
truncates, a trailing notice reports how many chars were omitted. The
memory-backend fan-out and ranking semantics are unchanged; this is a final
clamp applied after rendering.

Research-synthesis token-aware clipping remains tracked separately at #3233 and
is out of scope here.
