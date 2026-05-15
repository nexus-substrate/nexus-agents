---
'nexus-agents': patch
---

Consolidate the three drifting `PaperStatusSchema` definitions to one canonical source + add `deferred` + surface Zod issues in validation errors ([#2717](https://github.com/williamzujkowski/nexus-agents/issues/2717)).

Pre-fix the codebase had three disagreeing copies of the same enum: `indexer/research-index/research-index-base-types.ts` (6 values incl. in-progress), `research/research-schemas.ts` (5 values, no in-progress), and `cli/research-types.ts:31 PaperImplementationStatus` (4-value TS union with no partial / rejected). The data (`papers.yaml`) used a 7th value, `deferred`, that NONE of them accepted — `nexus-agents research stats` / `research check` / `research refresh` all failed with the opaque message `Validation failed for papers.yaml`, no further detail.

- **Canonical source**: `PaperStatusSchema` in `research-index-base-types.ts` now includes `deferred` (legitimate distinct state — 2 papers have it with a documented `deferral_rationale` + explicit re-open trigger block).
- **`research/research-schemas.ts`** imports + re-exports the canonical schema; no parallel z.enum.
- **`cli/research-types.ts`** `PaperImplementationStatus` is now `z.infer<typeof PaperStatusSchema>`-equivalent (TS-only `PaperStatus` re-export).
- **Validation error path** now includes the first 5 Zod issues in the user-facing message (`Validation failed for <path> — papers.X.implementation_status: Invalid option …; (+N more)`). Pre-fix the issues were stored in `error.details` but never made it to the user.

`research-index-test.ts:539` integration suite (skip-on-invalid-registry) un-blocks once this lands — was silently skipping itself for ~26 days because the registry didn't parse.
