---
'nexus-agents': major
'nexus-memory': major
---

Node.js >=24 is now required. Upgrade Node before installing the next major release of either package; Node 22 and 23 are no longer supported.

Both packages use the built-in `node:sqlite` on their runtime paths. Node 24 provides a more mature SQLite implementation and an LTS support window through April 2028, one year longer than Node 22. Use the latest Node 24 LTS patch release for SQLite fixes and security updates.
