---
'nexus-agents': patch
---

Send Codex and Gemini CLI prompts through stdin so large vote artifacts do not exceed Linux argument limits and fail voter seats. Vote responses now warn when a fallback changes a seat's model family, naming the role and its assigned and served families while preserving existing panel warnings (#7106).
