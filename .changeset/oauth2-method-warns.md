---
'nexus-agents': patch
---

`security.auth.method: 'oauth2'` now logs a startup warning that it is not implemented and behaves as `'token'`; the docs no longer present it as a live choice. The value is narrowed out of the schema at the next major (#5681). Panel decision on #5678.
