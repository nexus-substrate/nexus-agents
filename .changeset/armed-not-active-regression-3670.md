---
'nexus-agents': patch
---

test(capability-loop): codify the "armed ≠ active" safety invariant as a permanent
regression fence (#3670, #3769). Adds focused tests asserting that owner approval
satisfies only the human-authorization gate and can NOT bypass the conjunctive,
evidence-based gates: code-PR enable-readiness still blocks on the un-earned
guards-green soak / OFF→on flag, `executeCodePrPush` refuses (no external action)
while armed-but-not-ready (`not_enabled` / `no_credentials`), and enforce-readiness
(#3769) depends only on evidence — owner approval is not even an input. Also
documents the code-PR adapter activation requirements in the configuration guide.
Tests + docs only; no gate logic, threshold, guard, or default changed.
