---
'nexus-agents': patch
---

Refuse quality-gate scripts after an untrusted dev-pipeline implement stage edits the real repository. The result records the refusal without claiming that checks or the security scan ran (#6802).
