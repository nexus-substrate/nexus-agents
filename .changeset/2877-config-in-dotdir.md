---
'nexus-agents': patch
---

**feat(config):** `nexus-agents.yaml` now lives in `.nexus-agents/` by default. Closes #2877 (epic #2872).

The config-loader checks `.nexus-agents/nexus-agents.yaml` ahead of the legacy root-level location, and `nexus-agents setup` / `nexus-agents config init` write new configs to the dotdir. Existing root-level configs keep working without action — both writers and the loader fall back to them transparently. The migrate command (#2879) is the explicit way to relocate.

Locations checked in order:

1. `NEXUS_CONFIG_PATH` env (unchanged)
2. **NEW:** `<cwd>/.nexus-agents/nexus-agents.yaml`
3. **NEW:** `<cwd>/.nexus-agents/nexus-agents.yml`
4. `<cwd>/nexus-agents.yaml` (legacy root, still works)
5. `<cwd>/nexus-agents.yml` (legacy root, still works)
6. `<getNexusDataDir()>/nexus-agents.yaml` (global fallback, unchanged)

Touches: `config/config-loader.ts` (lookup), `cli/setup-config.ts` (writer), `cli/config-init.ts` (writer), `cli/doctor.ts` (probe), `cli-commands-handlers.ts` (first-run hint), `cli/setup-environment.ts` (env probe). 4 new tests in `config-loader.test.ts` pin the precedence + NEXUS_CONFIG_PATH dominance.
