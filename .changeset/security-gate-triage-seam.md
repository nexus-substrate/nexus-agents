---
'nexus-agents': minor
---

fix(security): delete the security-gate triage seam that fabricated every verdict (#5119 item 1)

`SecurityGateConfig.triageFn` had **zero production producers**. Both callers —
`pipeline/agent-executor.ts` and `mcp/tools/quality-gate-tool.ts` — passed no
config, and the only assignment anywhere was in a test. So `defaultTriageDelegate`
ran on every scan and returned a fixed
`{confirmed: true, confidence: 0.5, suggestedSeverity: 'high'}` for every finding.

Three things followed from a verdict that could not vary:

- `falsePositiveCount` was structurally 0, which made the summary's
  `"N filtered as false positives"` branch unreachable. The phrase has never
  rendered in production.
- The summary reported `"N confirmed blocking"`. Nothing confirmed anything; a
  fabricated default did. A finding blocks because its severity blocks, and that
  is now all the summary claims.
- `getLastTriageVerdicts()` exported those constant verdicts as triage evidence,
  with no consumer anywhere in the repo. So did `getLastScanLifecycle()`.

A seven-voter panel chose deletion over making the instrument report `unmeasured`
(7-0 in a runoff, after a 3-3 split in the first round reversed on a corrected
premise: the D camp's case rested on preserving a user-visible false-positive
line, which had in fact never rendered). The reasoning was that CLAUDE.md's
prefer-`unmeasured`-over-a-default rule presumes an instrument that can in
principle measure — one with no producer at all, reporting `unmeasured` forever,
is a placeholder, not a check, and capability-bias explicitly refuses
"no consumer at all".

Removed: `triageFn` and `maxTriageFindings` from `SecurityGateConfig`,
`defaultTriageDelegate`, the `triageFindings` call, `recordTriageLifecycle`,
`lastTriageVerdicts`/`getLastTriageVerdicts`, `lastScanLifecycle`/
`getLastScanLifecycle`, and the dead false-positive branch in the summary.
`getConfirmedBlockingFindings` becomes `getBlockingFindings`. The
`security/finding-triage.ts` module itself stays — `security/fix-generator.ts`
is a real consumer of it.

**The re-entry contract is recorded in the module header**, per the panel's
condition: triage returns through TDD with a named producer AND a named consumer
arriving together. A delegate seam kept ahead of its producer is what produced
the fabricated default in the first place.

Also fixed, in the same class: `FindingLifecycleSummary.falsePositiveRate` was
`number` and returned `0` when nothing had been triaged — an absent measurement
wearing a perfect score. It is now `number | null`, matching the idiom its
sibling `meanTimeToTriageMs` already used. The test that asserted
`falsePositiveRate === 0` on an empty summary had pinned the defect as intended
behaviour.
