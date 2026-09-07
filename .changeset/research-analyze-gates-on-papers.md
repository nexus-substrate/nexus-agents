---
'nexus-agents': patch
---

`research_analyze --focus gaps` now refuses when the papers registry cannot be
read, instead of reporting every topic as under-researched. Only the techniques
load gated the failure path; a failed papers load fell through to `{}`, so
`topicPaperCount` was empty, every topic cleared the "fewer than 2 papers"
filter, and the tool returned a maximal under-researched list under
`success: true`. `failureResponse` also now names which registry failed rather
than always saying "techniques".
