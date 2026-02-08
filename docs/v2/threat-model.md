# Threat Model: V2 Pipeline OS

---

## Threat Surface

The system's attack surface is:

1. **MCP tool input** — User-provided JSON via stdio. Primary input vector.
2. **GitHub content** — Issues, PRs, comments processed by issue_triage. Untrusted.
3. **Model responses** — AI model outputs may contain injection attempts.
4. **Plugin code** — Experimental plugins may have bugs or vulnerabilities.
5. **Config files** — nexus-agents.yaml parsed at startup. Local file.

## Threats

### T1: Prompt Injection via MCP Input

**Vector:** User passes crafted text in `task` field that causes a model to execute unintended actions.

**V1 mitigation:** Input sanitizer strips HTML injection vectors. Trust classifier categorizes input.

**V2 mitigation:** Plugin isolation ensures that even if a model returns malicious content, the plugin handler constrains what the model response can do. Plugins cannot import other plugins or access arbitrary system resources. Policy gates validate artifacts before they flow to downstream stages.

**Residual risk:** Low — models are invoked as CLI subprocesses with no direct system access.

### T2: Hostile Input via GitHub Content

**Vector:** Attacker creates GitHub issue with injection payload (hidden HTML, instruction-like text, authority claims).

**V1 mitigation:** Hostile Input Firewall (8 security modules). Agent Trust Labels. Typed actions only when processing untrusted input.

**V2 mitigation:** Same pipeline, now formalized as the `nexus:security-checker` plugin. Input from GitHub is tagged with trust tier in the TaskContract. Policy gates enforce: Tier 3-4 input cannot trigger execute stages without approval.

**Residual risk:** Low — defense in depth with sanitization + classification + policy gates.

### T3: Agent Privilege Escalation

**Vector:** An agent (via prompt injection or bug) attempts to perform actions beyond its scope — e.g., a code_expert trying to modify security config, or a plugin trying to import another plugin's capabilities.

**V1 mitigation:** Typed agent actions. No free-form tool calls from agents processing untrusted input.

**V2 mitigation:** Structural plugin isolation. Plugins receive `StageContext` with scoped access:

- ArtifactStore: only declared channels readable/writable
- AdapterAccess: only model calls, no system access
- No filesystem, no network, no process spawning from plugin code
  Policy engine rule `trust-tier` blocks execute stages when untrusted input is in context.

**Residual risk:** Medium — plugins that call models still depend on model behavior. Model output validation is the last defense.

### T4: Unbounded Resource Consumption

**Vector:** A pipeline enters an infinite loop or generates unbounded artifacts, exhausting memory or time.

**V1 mitigation:** maxSteps=100, global timeout=120s, per-node timeout, bounded checkpoint store.

**V2 mitigation:** Same bounds, plus:

- Per-edge maxTraversals (default 3) — prevents hot-loop edges
- Bounded event buffer (10k events)
- Bounded artifact store (1000 artifacts, 1MB per artifact)
- Policy gate `bounded-iteration` enforces per-stage max retries
- Policy gate `cost-budget` warns when approaching cost limit

**Residual risk:** Low — multiple overlapping bounds.

### T5: Plugin Trust Escalation

**Vector:** An experimental plugin (trustLevel: 'experimental') somehow gains core privileges.

**V2 mitigation:**

- Trust level is declared in manifest and validated at registration
- Config controls max allowed trust level
- Experimental plugins cannot be registered when `plugins.experimental.enabled: false`
- ESLint prevents cross-plugin imports (structural, not behavioral)
- Plugin registry is frozen after startup (no runtime registration)

**Residual risk:** Low — structural isolation enforced at compile time (ESLint) and load time (registry).

### T6: Artifact Poisoning

**Vector:** A compromised stage writes malicious content to the artifact store, which is consumed by downstream stages.

**V2 mitigation:**

- Artifacts carry provenance (creator stage, plugin, timestamp)
- Policy gates can validate artifact content between stages
- Trust tier propagates: if input artifact is tier 3, output artifacts inherit tier 3
- Scoped channel access: plugins can only write to declared channels

**Residual risk:** Medium — content validation requires semantic understanding. Policy gates can check structural properties but not semantic correctness.

## Security Properties

| Property             | Enforced By                         | Status               |
| -------------------- | ----------------------------------- | -------------------- |
| Input sanitization   | security/input-sanitizer            | V1 ✅                |
| Trust classification | security/trust-classifier           | V1 ✅                |
| Typed actions only   | security/action-schema              | V1 ✅                |
| Plugin isolation     | Plugin registry + ESLint            | V2 new               |
| Policy gates         | Policy engine                       | V2 new               |
| Bounded iteration    | GraphBuilder + policy               | V1 partial → V2 full |
| Artifact provenance  | Artifact store                      | V2 new               |
| Feedback integrity   | OutcomeStore (append-only, bounded) | V1 ✅                |
