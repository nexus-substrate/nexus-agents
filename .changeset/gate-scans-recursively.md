---
'nexus-agents': patch
---

Fix the TypeDoc coverage gate reporting live pages as missing (#4504).

**#4504's premise was false, and this corrects it.** The issue claimed three declared entry points — `pipeline`, `benchmarks`, `agents-ictm` — produced no documentation, leaving `PipelineRunner` (a canonical path) with no published API reference.

They produce pages. All three are **live right now**:

```
/api/exports/pipeline/     HTTP 200   (PipelineRunner appears 6×)
/api/exports/benchmarks/   HTTP 200
/api/exports/agents-ictm/  HTTP 200
```

TypeDoc emits them into `docs/api/exports/` because each module carries a slash-bearing `@module exports/<name>` tag, and `outputFileStrategy: "modules"` derives the output path from the module name. The 16 modules without such a tag fall back to their filename and land flat.

The real defect was in the gate added by #4513: `readGenerated()` used a **non-recursive** `readdirSync`, so nested pages read as absent. `KNOWN_MISSING` was therefore documenting a bug in the checking script, not a gap in the documentation — a measurement error dressed as a finding.

Fixed: the scan is recursive and comparison is on basename, so a nested emission counts as present. `KNOWN_MISSING` is now empty, and the gate reports **"All 19 declared entry points produced a page."** A genuinely missing page still fails (verified by removing one: exit 1).

Any future entry added to `KNOWN_MISSING` must be verified against the published site, not a directory listing.

Diagnosis produced by `run_dev_pipeline` during an e2e validation run, then independently verified against the live site before acting on it.
