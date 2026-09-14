---
'nexus-agents': patch
---

The ANSI-strip regex in `vote-command.test.ts` and the control-character scrub in `research-context.ts` now spell their control characters as `\x1b` / `[\x00-\x1f\x7f]` escapes instead of raw bytes (regex behaviour unchanged, proven by a byte-identity test per site), and the `control-bytes` arch-lint rule errors on any raw control byte with no baseline allowance (#6158).
