---
'nexus-agents': major
---

In 10.0, `security.auth.method` accepts only `token`. Configs specifying `oauth2`
now fail at load with an explicit migration error. OAuth2 was never implemented:
earlier versions accepted the value but performed bearer-token checks and warned
at startup. The obsolete startup warning has been removed.

Before upgrading, operators with `oauth2` in their config must change the method
to `token` to retain that bearer-token authentication:

```diff
 security:
   auth:
-    method: oauth2
+    method: token
```

Resolves [#5681](https://github.com/nexus-substrate/nexus-agents/issues/5681).
