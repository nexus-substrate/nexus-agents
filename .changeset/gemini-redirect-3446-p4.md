---
'nexus-agents': patch
---

feat(harness): add GEMINI.md redirect to AGENTS.md (#3446 Phase 4)

Completes the model-agnostic governance refactor: adds a root-level `GEMINI.md`
that redirects to AGENTS.md (the Gemini CLI reads `GEMINI.md` natively, or can be
pointed at `AGENTS.md` via `context.fileName`), and registers it in the
harness-alignment CI gate (`doctor-harness-alignment.ts`) so it can't silently
stop referencing AGENTS.md. Updates the AGENT_COMPATIBILITY matrix (Gemini row +
notes CLAUDE.md is now generated from AGENTS.md).
