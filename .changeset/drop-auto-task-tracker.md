---
'nexus-agents': patch
---

Removes `createAutoTaskTracker` (#5771 item 3). It had zero callers including
tests, and the one production site with adjacent behaviour deliberately does
something different — it auto-detects only when the backend choice is the `json`
default AND a repo is present, where the helper detected unconditionally.
`createTaskTracker` and `detectBackend`, which that site uses directly, are
untouched. Not in the published surface, so non-breaking.
