---
'nexus-agents': patch
---

Add 'retired' to TechniqueStatusSchema and unify research schemas to prevent research index rejection of retired techniques.

- Add `'retired'` to canonical `TechniqueStatusSchema` in `indexer/research-index/research-index-base-types.ts`, and re-export it from `research/research-schemas.ts` to maintain a single source of truth (DRY).
- Update `TechniqueStatusStats` and `countTechniquesByStatus` in `research-index-parser.ts` to account for retired status.
- Update `computeStats` in `research-index-generator.ts` and `validateHighPriorityIssue` in `research-validator-helpers.ts` to support retired status.
- Add `projectRoot` support to `ResearchIndexOptions` and `researchIndexCommand` in `research-index-command.ts`.
- Add test coverage verifying that `docs/research/registry/techniques.yaml` parses and validates cleanly through the CLI parser with retired techniques such as `daao-difficulty-estimation`.
