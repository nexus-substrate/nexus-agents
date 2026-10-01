---
'nexus-agents': patch
---

Preserve in-tree context windows, display names, output limits, quality scores, and CLI metadata when a model manifest overlay omits them. Explicit overlay values still take precedence, including overlays resolved through model aliases. New models without context metadata retain the conservative 8,192-token default.
