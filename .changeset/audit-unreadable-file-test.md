---
'nexus-agents': patch
---

pin the unreadable-file counter that shipped untested in #4788

Every fixture in #4788 exercised unparseable LINES; none exercised a file the
loader could not open. Deleting `unreadableFiles++` left all twelve tests green,
so the counter shipped unverified in a PR that reported mutation verification of
the two counters beside it.

Adds the missing case — a directory named like a log file, so `readFile` throws
EISDIR — and confirms it goes red when the counter is removed.
