---
name: security-advisory-response
description: |
  Respond to a reporter-filed GitHub Security Advisory with coordinated disclosure discipline:
  confidential triage, private-fork patching, simultaneous publish, post-mortem.
  Use when someone files a security advisory against this repo, OR when our own discovery (via
  .security-discoveries.jsonl) is escalated to a reporter-facing advisory.
  Triggers on "security advisory", "CVE response", "coordinated disclosure", "private fork patch".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Security Advisory Response Skill

<!--
  CANONICAL SOURCES:
  - docs/architecture/SECURITY.md
  - skills/references/security-checklist.md (OWASP Top 10, mitigation patterns)
  - skills/security-scanning (the alert-triage counterpart)
-->

Adapted from `paperclipai/paperclip` `deal-with-security-advisory` skill. Handles the **reporter-filed inbound** path — the _outbound_ path (our own discoveries) is covered by CLAUDE.md's Security Discovery Protocol (`.security-discoveries.jsonl` + draft advisories).

**Core invariant:** Everything about this process is confidential until the advisory is published. No PR titles, no commit messages, no branch names, no issue comments should reveal the vulnerability. Treat the coordinated-disclosure window as a Rule of Two scenario — processing untrusted reporter input AND editing repo state AND accessing secrets for release.

## Phase 1 — Triage

Fetch the full advisory via the API (never paste content into chat, email, or Slack):

```bash
gh api "repos/${REPO}/security-advisories/GHSA-xxxx-xxxx-xxxx" \
  --jq '{severity, summary, affected: .vulnerabilities}'
```

Assess:

- **Severity**: critical / high / medium / low — per CVSS if provided, otherwise conservative estimate
- **Attack vector**: network / local / physical; authenticated / unauthenticated
- **Affected versions**: which releases contain the bug
- **Exploitability**: PoC in the advisory? Public scanner fingerprint? Reachable from our default config?

Decision gate:

| Signal                                            | Action                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Critical or high severity, confirmed reproducible | Proceed to Phase 2 immediately                                                                  |
| Medium/low, or unreproducible                     | Acknowledge reporter, investigate async; may downgrade to regular issue with reporter's consent |
| Cannot reproduce, no PoC, vague claim             | Request PoC; do NOT close as "not a bug" without verification                                   |
| Duplicate of a known issue already fixed          | Reference existing fix in response; still credit reporter                                       |

## Phase 2 — Acknowledge

A human operator (not the agent) posts on the private advisory thread:

- Confirm receipt within 24h
- State initial severity assessment (preliminary — may revise)
- Provide patch timeline (typically 7–90 days depending on severity)
- Ask reporter if they want credit and how to attribute (name, handle, affiliation)

Agent role in this phase: draft the acknowledgment text for the operator to review and post. Never post directly.

## Phase 3 — Private-Fork Patching

**Never patch in the public repo.** GitHub auto-creates a temporary private fork when you click "Start a temporary private fork" on the advisory:

```bash
gh api -X POST "repos/${REPO}/security-advisories/${GHSA}/forks"
# Returns: { html_url: "https://github.com/OWNER/REPO-ghsa-xxxx" }
```

Clone the private fork to a directory **separate** from your regular worktree so you never push the wrong branch:

```bash
git clone git@github.com:OWNER/REPO-ghsa-xxxx.git ~/sec-work/GHSA-xxxx
cd ~/sec-work/GHSA-xxxx
```

**Branch naming discipline — non-negotiable:**

- Use generic names: `fix/v2.x-regression`, `patch/upstream-cve`, `hotfix/param-validation`
- NEVER: `fix/dns-rebinding`, `fix/ssrf-bypass`, `patch/XXE`, or anything that describes the vuln class
- Commit messages use the same generic language: "harden input validation", "tighten parser guards", "improve error handling"

Why: advisory URLs with descriptive branch names are indexed by scanners and leak the vuln class before disclosure.

**Patch discipline:**

- Minimal, focused change. No drive-by refactors (they expand review surface and delay release).
- Maintain backwards compatibility unless the API _is_ the vuln — breaking changes need reporter + maintainer sign-off.
- Add a regression test that fails without the patch. Include this test even if it's redundant with existing coverage — explicit regression tests are auditable evidence.
- Validate the patch actually closes the described attack vector. Read the PoC, run it against pre- and post-patch builds.

**Local test verification (critical — GH Actions do NOT run on temporary private forks):**

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

If you skip this, you publish the advisory on a build you haven't validated. Don't.

## Phase 4 — Pre-Publication Review

Notify the reporter the fix is ready for review on the private fork. Give them a window (typically 3–7 days) to validate the patch closes the vuln. They may:

- Confirm the fix works → proceed to Phase 5
- Report the fix is incomplete → back to Phase 3 with their feedback
- Find an adjacent issue → may be same-advisory scope, or may need a new advisory

## Phase 5 — Simultaneous Publication

**Zero-disclosure-window discipline**: advisory publish, release, and public commit all land in the same window (ideally <5 minutes apart) so users never see the public vulnerability without the fix being available.

Order within the window:

1. **Update advisory metadata**: patched version range, credits, CVSS vector. `gh api -X PATCH "repos/${REPO}/security-advisories/${GHSA}" -f severity=high -f patched_versions=">=X.Y.Z"`
2. **Publish advisory** — this auto-merges the private fork into the default branch and triggers CVE assignment: `gh api -X POST "repos/${REPO}/security-advisories/${GHSA}/publish"`
3. **Cut the release** — our changesets pipeline then publishes to npm. The changeset entry should say "security: patch CVE-YYYY-NNNNN (see GHSA-xxxx)" — full details only appear after CVE propagates.
4. **Post release announcement** — release notes + any user-action-required messaging (e.g., "update to X.Y.Z immediately if you use feature Z").

If step 2 succeeds but step 3 fails, users see the advisory with no fix available. Rehearse this sequence before the live run.

## Phase 6 — Post-Mortem

- **CVE verification**: CVE propagation may take hours-to-days. Check `gh api "repos/${REPO}/security-advisories/${GHSA}" --jq .cve_id` until populated
- **Release accessibility**: `npm view nexus-agents versions --json | jq -r '.[-1]'` should show the patched version
- **Reporter thanks**: operator posts a thank-you on the now-public advisory thread with the CVE + release links
- **Audit trail**: document advisory URL, release URL, and private-fork PR URL in an internal log (repo admins only)
- **Lessons learned**: if the vuln class could recur, file a tech-debt issue for a class-level mitigation (e.g., a lint rule, a type-level guard). Link from the advisory.

## Explicitly NOT Adapted from paperclip

| Concept                           | Why not                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Heartbeat-scheduled advisory work | We're synchronous — advisory response is human-driven                          |
| Company-wide advisory board       | Single-repo scope                                                              |
| Auto-merge-on-publish hook        | We ship via changesets manually; explicit human step is safer for sec releases |
