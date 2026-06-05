---
'nexus-agents': patch
---

docs(agents): promote agnostic sections into the AGENTS.md superset (#3446 Phase 1)

First step of making AGENTS.md the canonical model-agnostic source (mechanism C —
generation). Promotes the 5 agnostic-but-CLAUDE-only sections (Default Working
Mode, Context Budget, Error-Handling Q Protocol, Self-Check Quality Gate,
Autonomous Operation) into AGENTS.md in its harness-neutral voice, and wraps its
agnostic body in `<!-- AGNOSTIC:BODY:START/END -->` markers so a later generator
can slice it into CLAUDE.md. Additive only — CLAUDE.md is unchanged (de-dup is a
later phase); the existing RULES_INDEX injection + count probes are unaffected.
