---
'nexus-agents': minor
---

Make dropped model parameters LOUD (#4069, epic #4066 layer 3): planOptionalParams now classifies severity (behavioral params like temperature/seed/top_p warn loudly; cosmetic quiet), surfaces `warnings` on the CompletionResponse, and records a would-have-self-healed counter. Adds the MODEL_PARAMETER_UNSUPPORTED error code (non-retryable) for 400s that name an unsupported parameter, carrying the param name in error context.
