# Discovered Issues — "See Something, Say Something"

<!-- CANONICAL SOURCE: this file is the canonical body. CLAUDE.md keeps a summary that points here. -->

When you encounter a bug, incorrect behavior, or significant gap **outside the scope of your current task**, create a GitHub issue to capture it. Do not fix it inline — document it and continue your assigned work.

## When to Create an Issue (high-confidence findings only)

- Code that will produce **wrong results** (math errors, logic bugs, division by zero)
- Missing error handling that will **cause crashes** (unguarded `.length`, null deref)
- Tests that **assert wrong behavior** (testing the bug, not the fix)
- Documentation that **directly contradicts** code behavior

## Verify Before Filing — Mandatory Gate

> **Background:** A 2026-04-25 audit found a 100% false-positive rate in second-pass code-review subagent findings (#2225). Each false positive cost ~5 minutes of triage. The pattern: agents flagged `cli-handlers.ts:107 missing bounds check` but the bounds check existed at line 108 — the agent didn't read the next line. The same pattern across O(n²) claims (missed a `.slice(0, 20)` cap), TOCTOU claims (no `await` between check + write), Map mutation claims (sequential get-then-set, no concurrent iteration).

Before filing ANY discovered issue, complete this verification checklist:

1. **Re-read the cited line PLUS at least 5 lines before and 5 lines after.** Most false positives die here — the next line had the guard, or the previous line had the validation, or the loop had a slice cap.
2. **Trace the call path.** Is the flagged code reachable from a real entry point? Or does upstream validation (`isValidCommand`, schema parsing, etc.) filter the input before it gets here?
3. **Identify the observable failure.** What test would assert the bug? "Wrong return value", "leaked listener", "raised exception" — concrete. If you can't name a failing assertion, the finding is not load-bearing.
4. **Rule out language-level non-issues.** JS is single-threaded — "race conditions" require `await` between read and write. Maps are safe to mutate during iteration per ECMA-262. `NaN` comparisons fail closed silently.

If any of (1)–(4) raises a "wait, actually..." moment, **drop the finding**. Don't file it; don't even mention it in the report. False positives compound: they pollute the backlog, they train future agents on noise, they erode trust in the review tooling.

## When NOT to Create a Public Issue

- Style preferences or subjective improvements
- "Could be better" observations without concrete impact
- **Defense-in-depth gaps with no observable wrong behavior** — e.g. "this could be safer" without a reachable failure mode
- **Security vulnerabilities** — use the Security Discovery Protocol below instead
- Anything you're not confident about — when in doubt, skip it

## Issue Template

```bash
# Check for duplicates first
gh issue list --search "{keywords}" --state open

# Create the issue
gh issue create \
  --title "{type}: {description}" \
  --label "discovered,{bug|tech-debt|test|docs}" \
  --body "$(cat <<'EOF'
**Found during:** {what task was being performed}
**Location:** `{file}:{line}`
**Description:** {1-2 sentences}
**Severity:** {critical|high|medium}
EOF
)"
```

Types: `bug:`, `tech-debt:`, `docs:`, `test:`, `perf:`, `research:`

## Subagent Discovery Protocol

Subagent prompts should include: _"If you discover bugs or issues outside your task scope, include a `## Discoveries` section at the end of your response with: file path, line number, one-sentence description, severity, AND the verification gate output: which of the (1)–(4) checks above did this finding pass? If you can't name them concretely, the finding is not ready to file."_

The parent agent MUST process subagent `## Discoveries` sections:

1. **Re-verify each finding before filing** — do NOT just trust the subagent's confidence. Open the cited file, read the line + surroundings, trace the call path. The 2026-04-25 audit (#2225) found subagents had a 100% false-positive rate on second-pass findings — every one disqualified by reading 5 more lines or noticing a slice cap. Trust but verify.
2. **Deduplicate** against open issues (`gh issue list --search "..."`).
3. **Create issues only for findings that survive verification.** Each filed issue must include the specific failure mode in its body (a sentence that says "the failing test would assert X").

If a subagent surfaces N findings and 0 survive verification, that's a useful signal — note it as a meta-observation but don't file noise issues. The cost-benefit of a false positive is asymmetric: 30s to file, 5min to triage, indefinite backlog noise.

## Security Discovery Protocol

Security findings are **never** created as public GitHub issues. Instead, use a two-tier approach:

### Tier 1 — Local Security Log (ALL security findings)

Append to `.security-discoveries.jsonl` (gitignored, never committed):

```bash
echo '{"timestamp":"'$(TZ='America/New_York' date -Iseconds)'","severity":"{critical|high|medium|low}","file":"{file}:{line}","description":"{what was found}","foundDuring":"{task}","cwe":"CWE-XXX if known"}' >> .security-discoveries.jsonl
```

This file persists across conversations so findings are never lost, even if the user isn't watching chat.

### Tier 2 — GitHub Security Advisory (critical/high only)

For critical or high severity findings, also create a draft security advisory:

```bash
gh api repos/{owner}/{repo}/security-advisories \
  --method POST \
  -f summary="{brief description}" \
  -f description="{detailed finding}" \
  -f severity="{critical|high}" \
  -f "vulnerabilities[0][package][ecosystem]=pip" \
  -f "vulnerabilities[0][package][name]={component}"
```

Draft advisories are **private by default** — only visible to repo admins.

## Safeguards

- **Rate limit:** max 5 auto-created issues per hour
- **Duplicate check:** always search before creating
- **Security findings:** always logged to `.security-discoveries.jsonl`; critical/high also get draft GitHub security advisories
