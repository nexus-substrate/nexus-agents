---
'nexus-agents': patch
---

fix(experts): runtime type-guards in all 5 expert result parsers (#1913 Class A)

Previously parsers used `JSON.parse(...) as Partial<TResult>` which skipped runtime validation — an LLM returning `{ confidence: "high" }` slipped through the `?? fallback` because a non-empty string is truthy. Now each field is validated with explicit type guards and falls back to safe defaults on mismatch.

Applied to: code-expert-helpers, architecture-expert-helpers, testing-expert, documentation-expert, security-expert-helpers. Checks the parsed value is a plain object (not null/array), validates `confidence` is a number in [0,1], `operationType`/`analysisType`/`documentationType` match their enum, string arrays contain only strings, `compliance`/`apiDocs` are plain objects.

6 new regression tests in code-expert-helpers.test.ts covering string-confidence, out-of-range confidence, invalid enum, non-string array elements, non-object JSON (array input).
