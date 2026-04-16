---
'nexus-agents': patch
---

fix(adapters): honor task.systemPrompt in gemini and opencode adapters (#1886)

Completes the adapter parity fix started in v2.30.1 (codex). All 4 CLI adapters now honor `CompletionRequest.systemPrompt`:

- **claude**: `--system-prompt` flag (already working)
- **codex**: `-c model_instructions_file=<tempfile>` (fixed in v2.30.1)
- **gemini**: `--policy <tempfile>` — preserves system-role framing via gemini's policy file mechanism
- **opencode**: prepend to stdin content — no system-prompt flag exists in opencode CLI, so systemPrompt is prepended to user content with a `---` separator. Documented tradeoff: loses formal system-role distinction but satisfies the contract.
