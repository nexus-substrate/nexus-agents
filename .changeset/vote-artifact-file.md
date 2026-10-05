---
'nexus-agents': minor
---

Add `vote --artifact-file` and an optional MCP `consensus_vote` artifact input to inline a bounded UTF-8 file into every voter's proposal. Artifacts include a SHA-256 digest and byte count covered by the existing proposal hash, allowing read-only seats to review merge resolution diffs. Missing, empty, NUL-containing, and over-256-KiB files fail explicitly.
