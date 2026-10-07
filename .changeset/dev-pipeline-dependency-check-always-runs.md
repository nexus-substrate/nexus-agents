---
'nexus-agents': patch
---

The dev pipeline's security gate now runs the OSV dependency check even when the static-analysis baseline comparison is incomplete. Previously an incomplete comparison skipped the dependency check entirely, so a critical advisory or an unparseable changed manifest went unreported. The dependency result is now included in the gate details and coverage note, and a blocking dependency result fails the gate. An incomplete static-analysis comparison with clean dependencies is still reported as unmeasured (`skip`), never as a pass.
