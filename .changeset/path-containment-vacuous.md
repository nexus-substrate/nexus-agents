---
'nexus-agents': patch
---

fix(security): make the MCP path-containment check able to deny

`isPathSafe` compared normalized string prefixes, and `normalizePath('./')`
returns `'/'`. `allowedPaths` defaults to `['./']` in three places, so the check
returned true for every absolute path it could be handed — `/etc/shadow`,
`~/.ssh/id_ed25519`, anything. The rule's only live effect was the literal
`includes('..')` test beside it.

The prefix comparison also had no separator boundary, so a configured root of
`/work` admitted `/work-secrets`.

Both sides are now resolved against cwd and compared with an exact match or a
path-separator boundary. `'./'` means the working directory, which is what the
startup posture line printing `allowedPaths: ['./']` has always implied.

This matters for the staged policy rollout (#4988): the warn-mode telemetry
being collected as evidence for the enforce decision contained zero path
findings by construction, because the rule could not produce one.
