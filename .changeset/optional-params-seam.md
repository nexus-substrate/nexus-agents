---
'nexus-agents': patch
---

Extract the shared temperature drop-decision from the claude/openai/sdk adapters into one `planOptionalParams` seam (#4068, epic #4066 layer 2), consulting the layer-1 capability resolver and returning {dropped, transformed} for the layer-3 telemetry child (#4069). Behavior-preserving; gemini/ollama and all max-tokens handling are unchanged.
