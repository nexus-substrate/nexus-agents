---
'nexus-agents': patch
---

Collaboration sessions now report unresolved conflicting object fields with both experts' original values using the shared object-merge helper. Independent session patterns compare shared top-level keys; sequential and iterative refinement patterns explicitly skip comparison. Nested differences are recorded on their parent field, missing keys do not conflict, and array order matters. Finalization returns comparison failures as error results. Zero or one result explicitly reports no conflicts and no comparison; session output and quality scoring retain their existing behavior.
