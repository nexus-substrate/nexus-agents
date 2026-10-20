---
'nexus-agents': minor
---

Persist pipeline attempt decisions, evidence receipts, and recoverable diagnostic notification intents through the existing SQLite backend. Atomic admission prevents duplicate graph execution and rejects conflicting or unfinished attempts. Explicit retry identities retain prior outcomes; persistence failures fail closed and collector failures cannot undo acknowledged bus delivery.

V2 delegate/orchestrate route instrumentation now records its own bounded scope, without certifying adjacent V1 work. Diagnostic notifications carry stable intent and attempt IDs and remain at least once across an emission/acknowledgement crash. Plugin-declared stage failures now halt execution rather than becoming successful terminal records.
