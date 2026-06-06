---
---

docs(agents): correct the Mission frontier — research→context is wired (not the frontier)

Verification (#3231/#3238 closed as OBE) showed research→context is wired and
broadly adopted via the shared getContextForTask, so the mission's frontier
paragraph was stale. Corrects it: the real frontier is the code/capability loop
(signal → auto-implementation → evaluate, SICA-isolation), with two nearer
eval-gated steps (context-injection default-on #2795; auto-file research tasks
#3382). Docs-only.
