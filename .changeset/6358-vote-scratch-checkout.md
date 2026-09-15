---
'nexus-agents': minor
---

Ratification panels now run every voter in a detached scratch checkout of the specified PR head, protecting the caller's checkout from seat-initiated branch changes. Seats receive read-only instructions, and panel workspace creation and disposal are reported. If the commit is unavailable locally, the command asks you to fetch it first.
