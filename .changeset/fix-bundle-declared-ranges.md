---
'nexus-agents': patch
---

Fix `npm ci` failing in any project that depends on `nexus-agents` ("Missing: protobufjs@7.6.6 from lock file"). The bundled dependency tree shipped `protobufjs` 8, `fast-uri` 4 and `path-to-regexp` 9 under packages that declare the previous major, so a consumer lockfile could never match it, and consumers cannot override a bundle. The bundle now ships the patched release inside each declared major (`protobufjs` 7.6.6, `fast-uri` 3.1.9, `path-to-regexp` 8.4.2), which keeps every security fix. Projects that added scoped `overrides` for `nexus-agents` as a workaround can remove them.
