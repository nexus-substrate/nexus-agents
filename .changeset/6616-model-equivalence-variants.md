---
'nexus-agents': patch
---

Model equivalence: distinguish model size and modality variants in canonicalModelKey (#6616).

- Fold size and modality quirks (`small`, `image`) into `canonicalModelKey` so variants with distinct weights/modalities (e.g. `gpt-4o-mini` vs `gpt-4o`, `gemini-2.5-flash-image` vs `gemini-2.5-flash`) produce distinct identity keys.
- Detect `image`/`imagen` quirk during model id parsing.
- Support dotted minor versions directly following family roots (e.g. `gpt-4.1` extracts version `1` like `gpt-4-1`).
- Ensures `assessPanelIndependence` correctly reports panels with model variants as diverse rather than collapsed.
