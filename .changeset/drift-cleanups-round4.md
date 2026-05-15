---
'nexus-agents': patch
---

Drift cleanups — round 4 of the #2720 umbrella ([#2718](https://github.com/williamzujkowski/nexus-agents/issues/2718), [#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) partial).

- **#2718 — `getWeatherContext` now reads `m.recommendedCli` (the real field).** The pre-fix code cast `recommendedMappings` to `Array<{cli: string}>` and read `m.cli`, which doesn't exist — so every agent invocation that called `getWeatherContext` had `category → undefined` lines injected into its plan/exec prompt context. The mock in `agent-executor.test.ts` had propagated the same wrong shape, hiding the bug from tests. Test fixture now drift-gates on a literal `'→ undefined'` substring.
- **#2722 (partial) — Tighten `MCP_KEYWORDS`.** Removed `'interact'` and `'browse'` — both false-positive on plain English (`"how do these components interact?"` flipped `needsMcp` true and silently filtered out gemini; `'browse the documentation'` did the same). Replaced with the explicit phrases `'mcp tool'`, `'browse the web'`, `'browser automation'`. Test fixture pins the negative cases (`'interact'` in normal prose → `needsMcp: false`) and the positive cases (`'browser automation'` → `needsMcp: true`). #2722's other two sub-bugs (adapter-availability check + reasoning-text accuracy) tracked separately under the same issue — #2725 already addressed half of (b) downstream.
