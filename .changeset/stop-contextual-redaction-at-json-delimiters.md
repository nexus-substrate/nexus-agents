---
'nexus-agents': patch
---

Stop contextual value scanning at JSON-encoded whitespace/delimiters (`\n`, `\r`, `\t`) and escaped quotes (`\"`), preserving nonsecret decoded content across lines and within nested JSON text (#7426).
