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

**Zero-disclosure-window discipline**: code merge, patched release, and advisory publication all land in the same tight window (ideally <5 minutes apart) so users never see the public vulnerability without the fix being available.

> [!WARNING]
> **Advisory publication permanently deletes the temporary private fork.**
> GitHub does _not_ auto-merge the temporary private fork when you publish an advisory. You must merge all eligible private pull requests into the base branch _before_ publishing the advisory. Once an advisory is published, GitHub permanently deletes the temporary private fork; any unmerged private PRs or commits can no longer be merged through the advisory.

Sequence within the window:

1. **Locally verify private-fork PRs** — GitHub Actions workflows do _not_ run on temporary private forks. Before merging, check out the private PR branch and validate locally:
   ```bash
   pnpm install --frozen-lockfile
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
2. **Merge private-fork PRs into the base branch** — merge all private pull requests via the GitHub Security Advisory interface into the target base branch (e.g., `main`) _before_ publishing the advisory. Confirm the merge commit is present on the public branch.
3. **Cut and verify the patched release** — run the changesets pipeline to publish the patched release to npm. Verify registry accessibility before disclosing:
   ```bash
   npm view nexus-agents versions --json | jq -r '.[-1]'
   ```
   The changeset entry should say "security: patch CVE-YYYY-NNNNN (see GHSA-xxxx)" — full details only appear after CVE propagates.
4. **Publish the advisory** — publish the advisory by updating its state to `"published"` via `PATCH /repos/{owner}/{repo}/security-advisories/{ghsa_id}`, nesting `patched_versions` under each `vulnerabilities` entry:
   ```bash
   gh api -X PATCH "repos/${REPO}/security-advisories/${GHSA}" \
     --input - <<< '{
       "state": "published",
       "vulnerabilities": [
         {
           "package": {
             "ecosystem": "npm",
             "name": "nexus-agents"
           },
           "vulnerable_version_range": "< X.Y.Z",
           "patched_versions": "X.Y.Z"
         }
       ]
     }'
   ```
   _Note_: Do not use `POST /repos/{owner}/{repo}/security-advisories/{GHSA}/publish` (an unsupported route), and do not pass `patched_versions` as a top-level field (an unsupported schema).
5. **Post release announcement** — release notes + any user-action-required messaging (e.g., "update to X.Y.Z immediately if you use feature Z").

Because the release is cut and verified (step 3) before the advisory is published (step 4), users never see a public vulnerability disclosure before the fix is available on npm. Rehearse this operational sequence before the coordinated publication window (do not perform a real advisory publication merely to test documentation).

## Phase 6 — Post-Mortem

- **CVE verification**: CVE propagation may take hours-to-days. Check `gh api "repos/${REPO}/security-advisories/${GHSA}" --jq .cve_id` until populated
- **Release accessibility**: `npm view nexus-agents versions --json | jq -r '.[-1]'` should show the patched version
- **Reporter thanks**: operator posts a thank-you on the now-public advisory thread with the CVE + release links
- **Audit trail**: document advisory URL, release URL, and private-fork PR URL in an internal log (repo admins only)
- **Lessons learned**: if the vuln class could recur, file a tech-debt issue for a class-level mitigation (e.g., a lint rule, a type-level guard). Link from the advisory.

## Explicitly NOT Adapted from paperclip

| Concept                           | Why not                                               |
| --------------------------------- | ----------------------------------------------------- |
| Heartbeat-scheduled advisory work | We're synchronous — advisory response is human-driven |
| Company-wide advisory board       | Single-repo scope                                     |

## Anti-rationalization — Coordinated disclosure

| Excuse                                                     | Counter                                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| "It's low severity, don't bother with the private fork"    | Private-fork discipline applies regardless of severity. Severity informs timeline; the process stays the same.              |
| "I'll patch in the public repo, it's faster"               | Public branch names + commit messages leak the vuln class. Indexed by scanners within minutes. Always private fork.         |
| "We can publish before the fix tested in prod"             | The advisory window is when both publish and fix exist. Untested fix + public advisory = scrambling under pressure.         |
| "Reporter wants quicker disclosure, override our timeline" | Document the request, but the timeline is decided by maintainer + severity. Reporter pressure is an input, not a directive. |
| "Skip post-mortem, we patched it"                          | The lesson the post-mortem extracts is what prevents the next incident in the same class. Always do it.                     |

## Red flags

- Branch name or commit message describes the vuln class (e.g., `fix/dns-rebinding`)
- Private-fork patches CI doesn't run on (must verify locally)
- Advisory published before private-fork PR is merged (deletes temporary private fork and loses merge path)
- Advisory published before release is on npm (zero-disclosure-window violation)
- Reporter contacted on a non-private channel
- CVE not assigned (`gh api ... .cve_id` empty) at publish time

## Verification checklist

- [ ] Branch + commit names use generic language (no vuln class)
- [ ] Patch tested locally (`pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`)
- [ ] Reporter notified on private advisory thread; review window provided
- [ ] Private-fork PR merged into base branch before publishing advisory
- [ ] Patched release cut and verified on npm before advisory publication
- [ ] Advisory published via `PATCH` with `{"state":"published"}` and nested `patched_versions`
- [ ] Advisory + release published in same window (<5 min apart)
- [ ] CVE assigned and propagated; `npm view nexus-agents version` shows patched version
- [ ] Post-mortem recorded; class-level mitigation issue filed if applicable
