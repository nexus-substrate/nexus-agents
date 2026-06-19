---
'nexus-agents': minor
---

feat(capability-loop): autonomous code-PR write-time guard library (Stage 1, OFF — no runtime activation) (#3670)

Adds `src/mcp/tools/codepr-guards.ts`, a pure, deterministic guard library for
the future autonomous code-PR adapter. Stage 1 is library + tests ONLY — it
performs NO code-generation, NO git push, NO PR-open, and wires NO flag to live
behavior. It registers no MCP tool, CLI command, or workflow.

Guards (each returns a discriminated fail-closed result, never throws for an
expected denial): `confinePath` (path-escape confinement via realpath, with a
test seam), `classifyPath` (sensitive-path classifier with an exported,
staleness-tested self-guard denylist), `checkBlastRadius`, `scanDiffOrDeny`
(wraps the #3669 secret scan), `auditAutonomousEvent` (hash-chained audit append
for both a would-be PR and a fail-closed abort), `checkResourceBudget`, and the
composite `evaluateWriteGuards` entry point. Satisfies binding preconditions
A (deterministic-only decisions), B (self-modification lockout), C (audit), and
E (dependency-manifest authorship restriction).
