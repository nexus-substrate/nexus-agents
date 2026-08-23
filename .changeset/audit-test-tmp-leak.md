---
'nexus-agents': patch
---

fix(test): stop leaking a `/tmp` directory on every audit test run

`cli-server-audit.test.ts` allocated `/tmp/nexus-audit-test-<pid>`, hardcoded outside the managed `getNexusTmpDir()` tree, and never removed it. Closing the `AuditLogger` is not the same as deleting what it wrote into, and the pid meant runs never reused a path — so the directory count grew once per test run and never shrank. 73 had accumulated on the dev box, rising to 76 during the session that found it.

The path now comes from `mkdtempSync`, unique by construction rather than by pid, and a `finally` removes it on every path including a failing assertion.

Cleaning up exposed a second defect the leak had been hiding: `close()` was called as `void result.close()` and returned before the log stream had flushed, so deleting the directory underneath it raised an unhandled `AuditError: Failed to flush audit log`. It is awaited now. The test had never actually waited for the logger to finish; nothing noticed because the directory was never removed.

Volume is trivial — nexus-attributable content in `/tmp` totals 300K against 16G in use, so this is unrelated to the tmpfs exhaustion in #4488. What made it worth fixing is that it was unbounded by construction, and an unbounded directory count exhausts inodes before it exhausts bytes.
