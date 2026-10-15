---
'nexus-agents': minor
---

Align the native Gemini CLI with the measured AGY 1.3.5 model table: explicitly select registered Gemini 3.8 Flash by default and retain the available high/medium/low effort pins. Supported legacy Flash aliases migrate to 3.8 with selected-model attribution. Explicit Pro, retired native pins and unknown models now fail before execution rather than silently selecting another model; use the Google API for Pro. Preserve Google API defaults, model identifiers, profiles and pricing independently of the CLI default. Native tier selection excludes unavailable models without restricting API or gateway arms. Model enumeration does not establish authentication, provider-served identity or read-only enforcement.

Bind composite quality constraints and TOPSIS to each actual API/native model, sharing the existing ranking and constraint calculations. Expose an additive bound-profile quality-stage method and optional host-owned stage adapter bindings. API previews retain actual adapter metadata, and gateway slots resolve their serving target before quality/cost checks. Unknown API pricing remains unmeasured and fails configured quality ceilings; explicit free prices remain valid.
