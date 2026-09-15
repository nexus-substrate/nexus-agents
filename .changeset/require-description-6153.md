---
'nexus-agents': patch
---

`logger.setDestination('file', path)` now writes to the file. The file branch reached `fs` through a bare `require('fs')` under a lint suppression, and the package ships ESM only, so in the published bundle the first log line threw `Dynamic require of "fs" is not supported`. It is a static `node:fs` import now. Surfaced by adopting `eslint-comments/require-description` (#6153): the suppression could not state a true reason.
