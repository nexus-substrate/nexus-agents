---
'nexus-agents': patch
---

fix(registry): generated-registry loader now reads the refreshed data-dir file (#3707)

`registry refresh` writes the regenerated model catalog to the data dir, but `loadGeneratedRegistryEntries` read only the bundled package copy — so a refresh's generated file was silently never picked up, even after #3185's in-process `reloadDefaultRegistry()`. The loader now prefers a refreshed `model-registry.generated.json` in the data dir when present (the same data-dir > package precedence the overlay path uses; the package dir is also typically read-only under a global npm install), falling back to the bundled copy. Fail-soft preserved.
