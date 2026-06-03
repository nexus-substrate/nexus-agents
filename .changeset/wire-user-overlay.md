---
'nexus-agents': minor
---

The user overlay `~/.nexus-agents/models.yaml` (in ManifestSchema/`ModelEntry` format) now overrides registry model data — below the operator manifest, above in-tree. This consolidates the two overlay loaders onto `manifest-overlay`, which now loads both the user path (`models.yaml`, lower precedence) and the operator path (`models-manifest.yaml`, higher precedence) and merges them into the single `manifest` registry tier (operator wins on id collision). Completes #3293's overlay-consolidation intent and removes the dead `capability-overlay` loader (its old `ModelCapability` format had zero production effect). Both paths are validated with `ManifestSchema` and fail closed on malformed/oversized files. `registry doctor` now reports the user-overlay path/status from the manifest loader. (#3351)
