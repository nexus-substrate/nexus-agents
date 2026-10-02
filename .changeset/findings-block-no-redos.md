---
'nexus-agents': patch
---

Extract the `pr_review` findings block by plain string search instead of a lazy regex that could backtrack polynomially on reasoning text with many unterminated fences (CodeQL alert 255). Parsing results are unchanged.
