# PR #7497: Decouple Model List from CLAUDE.md and Governance Injector

- Removed `MODEL_LIST` injection from `scripts/inject-governance.ts`.
- Removed `extractModels()` and `generateModelList()`.
- Removed `modelListStart` and `modelListEnd` markers from `scripts/governance-markers.ts`.
- Removed `MODEL_LIST` from `EXEMPT_SPAN_NAMES` in `scripts/governance-stamp-exemption.ts`.
- Replaced static model list in `CLAUDE.md` with explicit pointers to `list_available_models`, `nexus://models`, and `getDefaultRegistry()`.
- Aligns `CLAUDE.md` with `AGENTS.md` (which carries no static model list).
