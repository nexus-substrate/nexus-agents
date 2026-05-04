---
'nexus-agents': patch
---

Fix `BuiltInExpertTypeSchema` missing `'qa'` literal (#2338).

The `BuiltInExpertType` type union (`expert-config.ts:67–80`) declared 12 valid expert types including `qa`, but the corresponding Zod enum schema (`expert-config.ts:159–171`) only listed 11 — `qa` was omitted. `BuiltInExpertTypeSchema.parse('qa')` threw at runtime even though TypeScript accepted it as a valid type. Added `qa` to the enum and a contract test that walks every literal in `BuiltInExpertType` through the schema so this drift is caught at CI time.
