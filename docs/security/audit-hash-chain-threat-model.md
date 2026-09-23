---
title: 'Threat Model: Audit Hash Chain'
description: Adversarial analysis of the audit-logger hash chain and what verify_audit_chain does and does not detect
tier: 1
keywords: [security, audit, hash-chain, threat-model, tamper-evidence, integrity, immutable-audit]
---

# Threat Model: Audit Hash Chain

This document is the adversarial analysis of the audit hash chain implemented in
`packages/nexus-agents/src/audit/audit-logger.ts` and verified by the
`verify_audit_chain` MCP tool
(`packages/nexus-agents/src/mcp/tools/verify-audit-chain-tool.ts`).

The hash chain is the substrate every "immutable audit" governance claim leans
on (the phrase appears in `CLAUDE.md` and `AGENTS.md`). This threat model is
itself the evidence for that claim: it states, honestly and per-threat, what the
chain protects against today and what it does **not**. The headline finding is
that the chain is **tamper-evident against in-place edits but not against a
whole-log rewrite**, because there is no external anchor, no signing, and no
monotonic counter. Read the residual-risk lines, not just the design.

> Scope note. This covers the integrity of the persisted audit log only.
> Prompt-injection, plugin isolation, and pipeline-level threats are covered by
> the [V2 Pipeline threat model](../v2/threat-model.md). Implementing new
> mitigations is out of scope here; gaps are filed as follow-up work
> (see [Recommendations](#6-recommendations)).

---

## 0. Precondition: the chain is OFF by default

Everything below describes a chain that exists. **In a default installation it does not.**

`cli-server-audit.ts:30` gates the whole subsystem:

```ts
if (securityConfig?.audit?.enabled !== true) {
  logger.debug('Audit logging disabled (set security.audit.enabled: true to enable)');
```

No shipped config sets `security.audit.enabled`, so unless an operator opts in, no
events are written and every threat in section 3 is vacuous — not mitigated, not
unmitigated, simply not applicable. `verify_audit_chain` against such an
installation returns `ok: true` with `notVerified: 'empty'` (#4768): honest, but a
reader who checks only `.ok` learns nothing.

The server does warn at startup
(`cli-server-audit.ts:162` `warnIfAuditDisabled`):

> Audit logging is disabled — no tamper-evident event chain is being written.
> Set `security.audit.enabled: true` to enable it.

Stated here because this document previously described the chain's guarantees in
full — `enableHashChain` defaulting to `true`, pruning behaviour, the T-numbered
threats — while never saying whether a chain is being written at all. Those two
facts read as one: a default `enableHashChain: true` describes how events link
_if_ events are logged, not whether they are. `CLAUDE.md` compounds it by calling
the record load-bearing ("everything is logged and a human can review it later"),
which describes a **capability**, not the default state (#4579).

Two distinct claims, and only the first is true out of the box:

| Claim                                         | Default                              |
| --------------------------------------------- | ------------------------------------ |
| "if events are logged, they are hash-chained" | **true** (`enableHashChain`)         |
| "events are logged"                           | **false** (`security.audit.enabled`) |

An operator relying on the audit chain for any governance claim must enable it
explicitly and verify with `verify_audit_chain` that `notVerified` is absent.

## 1. Design

### 1.1 What an entry is

Each audit event is an `AuditEvent` (schema: `audit-types.ts:99`). Events are
written one-per-line as JSON-L into rotating `audit-<date>-<time>.jsonl` files
by `FileAuditStorage` (`audit-storage.ts:268` `write`, `:201` `generateFileName`).

### 1.2 How entries link (`prevHash` → `hash`)

Hash chaining is controlled by `enableHashChain`, which **defaults to `true`**
(`audit-types.ts:305`).

Events are linked when a queued batch is flushed, not when they are logged
(`audit-logger.ts` `sealChain`, since #6546):

1. `event.previousHash` is set to the hash of the chain's current head. With
   `FileAuditStorage` that head is the last valid event **already on disk**,
   read under a cross-process lock (see [§1.5](#15-multiple-writer-processes-6546)),
   so a restarted or concurrent process continues the one chain in `logDir`.
   Only the first event in an **empty** log directory has
   `previousHash === undefined` (a genesis event). A storage without
   `appendChained` (e.g. `InMemoryAuditStorage`) chains from the logger's own
   in-memory head, as before.
2. `event.hash = computeEventHash(event)` is computed and the head advances to
   it.

Before #6546 the head was the logger's in-memory `lastHash`, which starts empty
in every process. Every process start therefore wrote a new genesis event into
the middle of an existing file, and every such seam verified as
`previous_hash_mismatch` — indistinguishable from a deleted event.

`computeEventHash` (`audit-logger.ts:~64`) is `SHA-256` over a JSON projection.
Since **#3921 the projection is versioned** (`hashVersion`). For a normal event
the projection covers **only these fields**:

```text
id, timestamp, category, action, outcome, actor, previousHash
```

This is the load-bearing detail of the entire model. **For a normal event the
hash does not cover all of the event's content.** Fields excluded from the
default projection include: `severity`, `description`, `resource`, `requestId`,
`traceId`, `sessionId`, `toolName`, `durationMs`, `metadata`, `policyName`,
`policyDecision`, `violationType`, `timestampMs`, and `version`. An attacker can
mutate any of those fields in place and the recomputed hash will still match —
see [T7](#t7-content-tampering-in-unhashed-fields).

**Exception (#3921 — versioned projection).** A tier-transition event (a
`governance`-category event carrying `metadata.tierTransition`) is hashed under
`hashVersion: 2`: the projection additionally folds in `hashVersion` and the
canonicalized `metadata.tierTransition` payload (`audit-logger.ts:~58-77`). For
those events the tier-transition payload **is** hash-covered, and because the
`hashVersion` is itself part of the projection, a tampered or stripped version
field cannot silently downgrade the hash. The blanket "metadata is fully
excluded / an attacker can mutate it in place" claim therefore does **not** hold
for tier-transition events.

### 1.3 Append-only semantics

"Append-only" is a **storage convention, not an enforced property**:

- `FileAuditStorage.write` opens the stream with flag `'a'`
  (`audit-storage.ts:236`) and appends a line.
- There is no OS-level immutability (`chattr +a`), no write-once medium, no
  per-line fsync barrier, and no separate writer identity. Anything with write
  access to `logDir` can truncate, rewrite, reorder, or delete files.
- Rotation prunes the oldest files once `maxFiles` is exceeded
  (`audit-storage.ts:256` `pruneOldFiles`, default `maxFiles: 10` at
  `audit-types.ts:179`). **Legitimate, silent loss of old history is part of
  normal operation** — see [T1](#t1-truncation-drop-tail-entries).
- Under in-memory queue pressure the logger drops the **oldest** un-flushed
  events (`audit-logger.ts:269-285`, `maxQueueDepth` default `10_000` at
  `audit-types.ts:191`). Dropped events never reach the chain at all, and
  since #6546 they leave no link break either: linking happens at flush, after
  the drop. The loss is visible only through the logger's drop warning and
  counter, not through `verify_audit_chain`.

### 1.4 What `verify_audit_chain` actually checks

`verifyChain` (`audit-logger.ts:129`) walks the event array in order and, per
event, calls `verifyEvent` (`audit-logger.ts:77`), which enforces three
invariants:

1. **`missing_hash`** — event has no `hash` field but the chain started hashed
   (`audit-logger.ts:82`).
2. **`previous_hash_mismatch`** — for `index > 0`, `event.previousHash` does not
   equal the prior event's `hash` (`audit-logger.ts:91`).
3. **`hash_mismatch`** — recomputed hash of the (hashed) fields does not equal
   the stored `hash` (`audit-logger.ts:100`).

It returns the **first** failure and stops (`audit-logger.ts:138`) — one tamper
invalidates everything downstream.

Two short-circuits matter for the threat analysis:

- **Empty log ⇒ `{ ok: true, eventCount: 0, notVerified: 'empty' }`**
  (`audit-logger.ts:192`).
- **First event has no `hash` ⇒ the whole batch is treated as un-chained and
  returns `{ ok: true, notVerified: 'unchained' }`** (`audit-logger.ts:193-195`).
  This is the backward-compat path for logs written with `enableHashChain:
false`. It is also an attack surface — see [T3](#t3-rewrite-and-rehash) /
  [T8](#t8-chain-disable--downgrade).

Both still return `ok: true` — there is nothing to contradict — but since #4773
they carry `notVerified`, so a caller can tell "verified" from "verified
nothing". The verdict is only as good as the caller's willingness to read that
field; nothing fails closed.

The MCP tool (`verify-audit-chain-tool.ts`) loads every `audit-*.jsonl` file in
the directory in **lexicographic filename order** (`:67-69`), concatenates the
parsed events, and runs `verifyChain` over the combined sequence (`:130-131`).
Malformed or unreadable lines/files are **skipped with a warning**, not treated
as failures (`:78`, `:89`, `:96`) — relevant to [T1](#t1-truncation-drop-tail-entries)
and [T5](#t5-missing--selective-omission). The tool is read-only (`:9-14`).

### 1.5 Multiple writer processes (#6546)

One `logDir` routinely has several writers: every MCP server start, and every
concurrent session. `FileAuditStorage.appendChained` serializes them with the
advisory cross-process lock in `utils/file-lock.ts` (#6548), at
`<logDir>/<filePrefix>.lock`. While the lock is held the storage:

1. switches to whichever `audit-*.jsonl` file is newest **now**, since another
   process may have rotated since this one last wrote — appending to an older
   file would place the batch before events it chains after;
2. reads the head: the last line of the newest file that parses as an
   `AuditEvent`, walking back to older files past one that holds no event yet
   (a file another process rotated to but has not written). Lines the verifier
   would skip are skipped here too; chaining to one would itself be a break.
   No event anywhere, or an un-hashed last event, is the empty case: the batch
   starts a genesis event;
3. links the batch onto that head, writes it and waits for the write to reach
   the file, then releases the lock.

The read and the append share the lock, so two processes cannot both link to
the same head (a benign [fork](#t2-fork-divergent-chains)) or interleave lines.
A batch whose lock acquisition times out was never linked, so it stays queued
for the next flush rather than being lost.

**Limits.** The lock is advisory. A writer that does not take it — an
`AuditLogger` from a release before #6546, still running from a pinned global
install, or anything else appending to the directory — still produces seams
that verify as `previous_hash_mismatch`, and the breaks continue until every
writer is upgraded. The lock's staleness rule for an owner on another host is
age-based, so a `logDir` on a network filesystem shared across hosts is not
covered by the same guarantee.

**Breaks already on disk stay reported.** A log written before #6546 carries a
`previous_hash_mismatch` at every former process restart. Those are real
breaks in the record — the logger did write a genesis event into the middle of
the chain — and the verifier cannot tell them apart from a deletion, so it
keeps reporting them. There is deliberately **no "benign break" or "chain
restart" marker**: the hash is keyless ([§2](#2-adversary-model)), so any
marker the logger can write, a storage adversary can write too, and a marker
that tells the verifier to accept a break is exactly what a
[T5](#t5-missing--selective-omission) deletion would add to hide itself. The
first post-fix event links to the last pre-fix event, so the old break stays in
the directory until rotation prunes it. An operator who wants a clean verdict
sooner moves the pre-#6546 files out of `logDir` into an archive; the verifier
then reports the remaining chain with `unanchoredHead`, which is the honest
statement: links verified, origin elsewhere ([T6](#t6-first-record-integrity-no-anchor)).

---

## 2. Adversary model

| Adversary                | Capability                                                                                                 | Primary relevance |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| **Storage compromise**   | Read/write to `logDir` files only; cannot run the logger process or modify code.                           | T1–T6             |
| **Process compromise**   | Runs as the logger; can call `computeEventHash`, knows the algorithm, holds no secret key (there is none). | T3, T4, T8        |
| **Code/tool compromise** | Can modify `audit-logger.ts` or the verify tool / its inputs.                                              | T9                |

The critical observation: **the hashing algorithm uses no secret.**
`computeEventHash` is a keyless `SHA-256` (`audit-logger.ts:45-56`). Any
adversary who can read the code (it is open source) can recompute valid hashes.
The chain is therefore **tamper-evident only against an adversary who edits the
files but does not recompute the chain.** It is **not tamper-proof** against one
who does.

---

## 3. Threats

Each threat states the vector, whether `verify_audit_chain` detects it today,
and the residual risk.

### T1: Truncation (drop tail entries)

**Vector.** Storage adversary deletes the last N lines of the newest log file,
or deletes whole newer files. The remaining prefix is a perfectly valid chain.

**Detected?** **No.** A truncated prefix verifies as `{ ok: true }` — every
`previousHash` still matches its predecessor and every `hash` still recomputes.
`verifyChain` has no notion of "expected length" or "expected head". Normal
rotation/pruning (`audit-storage.ts:256`) and queue drop-oldest
(`audit-logger.ts:269`) both produce the same shape, so even a benign system
routinely "truncates".

**Residual risk: HIGH.** This is the single largest gap. There is no
high-water-mark, no signed checkpoint of the latest hash, and no external record
of how many events should exist. Tail loss — malicious or accidental — is
undetectable by the chain alone.

### T2: Fork (divergent chains)

**Vector.** Adversary takes a valid prefix ending at event K, then appends a
**different** continuation (events K+1′…) computed correctly from event K's
hash. Two internally-valid chains now share a prefix and diverge.

**Detected?** **Not by a single verification.** Either fork verifies as
`{ ok: true }` on its own, because each is a well-formed chain. Detection
requires comparing two captured copies of the log and noticing they diverge
after a shared prefix — `verify_audit_chain` only ever sees one directory.

**Residual risk: HIGH** in the absence of an external anchor. With a periodic
external anchor of the head hash (see [Recommendations](#6-recommendations)), a
fork is detectable: at most one branch can match the anchored head hash for a
given point in time.

This threat is an adversary's deliberate fork. Concurrent logger processes
used to produce an accidental one — two chains interleaved in one file, each
link failing — and since #6546 the append lock in
[§1.5](#15-multiple-writer-processes-6546) prevents that.

### T3: Rewrite-and-rehash

**Vector.** Process or code adversary rewrites the entire log — alters or
removes events anywhere — and **recomputes the whole chain** from the first
event forward using `computeEventHash`. The algorithm is keyless
(`audit-logger.ts:45`), so every `hash` and `previousHash` is internally
consistent.

**Detected?** **No.** This is the fundamental limitation. `verifyChain` only
checks internal consistency; a fully-recomputed chain is internally consistent
by construction. The adversary can even start the rewritten log with an
un-hashed first event to hit the un-chained short-circuit
(`audit-logger.ts:193-195`) and skip hashing entirely — though since #4773 that
path is labelled `notVerified: 'unchained'` rather than a bare `ok: true`, so
the downgrade is visible to a caller who checks.

**Residual risk: HIGH.** Nothing in the current implementation defends against
this. Closing it **requires a secret the attacker cannot reproduce** (an HMAC
key or signing key) or an **external anchor** the attacker cannot rewrite (an
append to a remote/WORM store, a transparency log, etc.). Neither exists today.

### T4: Reordering

**Vector.** Adversary permutes events within the log.

**Detected?** **Partially / usually yes**, but with a sharp edge:

- Reordering events **without recomputing hashes** breaks the
  `previousHash` linkage at the first moved boundary ⇒ `previous_hash_mismatch`
  (`audit-logger.ts:91`). Detected.
- However, **timestamps are not part of the hash** in a way that enforces
  monotonicity, and `verifyChain` does **not** check that `timestamp` /
  `timestampMs` are non-decreasing. So an adversary who recomputes the chain
  after reordering (a special case of [T3](#t3-rewrite-and-rehash)) produces a
  valid chain whose timestamps are out of order, and that is **not** flagged.

**Residual risk: MEDIUM.** Naive reordering is caught; reorder-then-rehash is
not, and there is no monotonic-counter or timestamp-monotonicity check to catch
the temporal anomaly.

### T5: Missing / selective omission

**Vector.** Adversary removes specific events from the middle of the log
(e.g. the one `policy.evaluate` deny that incriminates them) and either (a)
leaves the rest untouched, or (b) re-stitches the chain.

**Detected?**

- Middle deletion **without re-stitching** ⇒ the next event's `previousHash` no
  longer matches the new predecessor ⇒ `previous_hash_mismatch`
  (`audit-logger.ts:91`). Detected.
- Middle deletion **with re-stitch/rehash** ⇒ a special case of
  [T3](#t3-rewrite-and-rehash). **Not detected.**
- Note the tool also silently skips lines it cannot parse
  (`verify-audit-chain-tool.ts:89,96`). An adversary who **corrupts** a line
  rather than deleting it gets it dropped from the verified set without a
  failure — though the surviving neighbours then mismatch unless re-stitched,
  so this collapses back to the same two cases.

**Residual risk: MEDIUM–HIGH.** Detectable only when the attacker is lazy
(doesn't re-stitch). A motivated attacker with write access re-stitches and the
omission is invisible — same root cause as T3.

### T6: First-record integrity (no anchor)

**Vector.** The first event written to an empty log directory has
`previousHash === undefined` (`audit-logger.ts` `sealChain`; before #6546, the
first event of every logger process did); there is nothing before it to bind
to. An adversary can substitute a fabricated "genesis" event, or splice
a fabricated history before the real first event.

**Detected?** **Partially, since #4703.** `verifyEvent` still skips the
`previousHash` comparison at `index === 0` — there is genuinely nothing in the
chain to compare against. But `verifyChain` now reports `unanchoredHead` when
the first event carries a `previousHash` at all, which is the observable trace
of a front-deletion that did not recompute anything.

This closes a specific gap rather than T6 as a whole. Before #4703 a
front-truncated chain returned a clean `ok: true` **while its head still
carried a live 64-hex pointer to the deleted predecessor** — the evidence was
present and discarded. That contradicted this document's own claim (§ Threat
Coverage) to detect naive deletions by an adversary who does not recompute the
chain, since deleting the first _n_ lines is exactly that class.

What is reported is deliberately **not** `ok: false`. Routine log rotation
(`pruneOldFiles`, `audit-storage.ts`) produces an identical shape, and a
verifier that reports tamper on every rotated deployment is one operators learn
to dismiss — which is how a real tamper gets waved through. The verifier cannot
distinguish the two cases, so it says so: links verified, origin unverified.

**Still undetected:** a fabricated genesis (`previousHash` absent, hashes
recomputed from a forged first event) is indistinguishable from a real one.
That is the part needing an external anchor.

**Residual risk: MEDIUM** (was HIGH). No genesis anchor and no binding of the
first hash to an external value (a config commit, a deployment ID, a previous
log file's final hash) — each log directory's chain still floats free. What
changed is that a chain which _claims_ a predecessor it cannot show now says so
instead of reporting clean.

### T7: Content tampering in unhashed fields

**Vector.** Adversary edits any field **not** in the hashed projection —
`description`, `metadata`, `resource`, `toolName`, `policyName`,
`policyDecision`, `violationType`, `severity`, `timestampMs`, `traceId`, etc.
(see [§1.2](#12-how-entries-link-prevhash--hash)).

**Detected?** **Partially — qualified since #3921.** For a _normal_ event,
`computeEventHash` hashes only
`{id, timestamp, category, action, outcome, actor, previousHash}`
(`audit-logger.ts:~64`). Mutating an unhashed field leaves the stored `hash`
valid. For example, an attacker can rewrite `metadata.currentRate` on a
rate-limit event, or rewrite a `description`/`policyName`, with **zero** chain
impact. **The exception** (#3921): a tier-transition event hashed under
`hashVersion: 2` folds `metadata.tierTransition` into the projection, so that
specific payload **is** covered and this vector does not apply to it.

**Residual risk: HIGH for normal events, narrowed for tier transitions.** For
ordinary events the chain still gives a false sense that "the audit record is
tamper-evident" when in fact much of the event schema — including
security-relevant `metadata`, `policyDecision`, and `violationType` — is
unprotected; this is independent of T3 and does not even require rehashing. The
versioned-projection work (#3921) closed this for the tier-transition payload
specifically; the general case remains open.

### T8: Chain-disable / downgrade

**Vector.** Two sub-cases. (a) Operator/config sets `enableHashChain: false`
(`audit-types.ts:305`) so no hashes are ever written. (b) Adversary makes the
**first** retained event un-hashed (delete the leading hashed file, or strip the
first line's `hash`).

**Detected? Partial** (since #4773). `verifyChain` still returns `ok: true` for
an un-chained log — there is nothing to contradict — but it no longer returns it
bare. Both sub-cases now set `notVerified: 'unchained'`
(`audit-logger.ts:193-195`), and a log with no events at all sets
`notVerified: 'empty'`, which is what pointing the verifier at the wrong
directory produces. The marker is serialised straight through the MCP tool, so
a `verify_audit_chain` caller sees it.

Since #4788 the tool also reports `skippedLines` / `unreadableFiles` when part
of the log could not be parsed, so a verdict over a partially-read log is no
longer reported as one over the whole log.

**What is still open.** `ok: true` remains the verdict, so a caller that reads
only `ok` and ignores `notVerified` is fooled exactly as before — the marker
moves the burden to the caller rather than removing it. There is **no**
fail-closed path: nothing compares the log's chained-ness against a policy that
expects chaining, so sub-case (a) — an operator setting `enableHashChain:
false` — is reported but never refused.

**Residual risk: MEDIUM** (was HIGH). The ambiguity between "verified chained
log" and "un-chained log, nothing to verify" is resolved _in the record_. The
remaining risk is that the record has to be read: full mitigation requires
failing closed on an un-chained log when policy expects chaining.

### T9: Tampering with the verification tool itself

**Vector.** Code adversary modifies `verifyChain` / `verifyEvent` /
`computeEventHash` (`audit-logger.ts`) or the MCP tool
(`verify-audit-chain-tool.ts`) to always return `{ ok: true }`, or runs the tool
against a sanitized copy of the directory.

**Detected?** **No** — by definition, a compromised verifier cannot be trusted to
report its own compromise. There is no independent re-implementation, no signed
attestation of the verifier binary, and the verifier shares a process and code
base with the logger it audits.

**Residual risk: HIGH (but standard).** This is the classic "who watches the
watcher" problem and is only meaningfully closed by running an **independent,
out-of-band verifier** (different code/host) over an **externally anchored** copy
of the log. The single-key/no-key in-repo design cannot self-defend here.

---

## 4. Threat summary

| #   | Threat                               | Detected by `verify_audit_chain` today?   | Residual risk |
| --- | ------------------------------------ | ----------------------------------------- | ------------- |
| T1  | Truncation (drop tail)               | No                                        | HIGH          |
| T2  | Fork (divergent chains)              | No (single view)                          | HIGH          |
| T3  | Rewrite-and-rehash                   | **No** (fundamental)                      | HIGH          |
| T4  | Reordering                           | Yes if not rehashed; No if rehashed       | MEDIUM        |
| T5  | Missing / selective omission         | Yes if not re-stitched; No if re-stitched | MEDIUM–HIGH   |
| T6  | First-record integrity (no anchor)   | Partial (unanchoredHead, #4703)           | MEDIUM        |
| T7  | Content tampering in unhashed fields | **No**                                    | HIGH          |
| T8  | Chain-disable / downgrade            | Partial (`notVerified`, #4773)            | MEDIUM        |
| T9  | Verifier tampering                   | No (by definition)                        | HIGH          |

**The chain reliably detects exactly one class of attack:** in-place edits or
naive deletions/reorderings by an adversary who does **not** recompute the chain
(the unhashed-field subset of in-place edits, T7, is the exception even here).
Every attack by an adversary with write access who is willing to recompute the
keyless hash (T3 and its specializations) is **undetectable**.

---

## 5. Mitigations: present vs. absent

### Present

- **In-place tamper-evidence** via SHA-256 chaining of a subset of fields
  (`audit-logger.ts:45-56`, `:129`).
- **Path-traversal protection** on `logDir` (`audit-storage.ts:56`, `:80`),
  including a system-directory denylist (`:100`) — protects _where_ logs are
  written, not their integrity once written.
- **Read-only verifier** that never mutates the log (`verify-audit-chain-tool.ts:9-14`).
- **Append-mode writes** (`audit-storage.ts:236`) — a convention, not enforcement.

### Absent

- **No secret/keyed integrity.** Hashing is keyless SHA-256 — defeats T3.
- **No signing** of audit events and checkpoints. (The committed vote ledger
  is the exception since #3927 item 4 — optional per-record SSH signatures,
  reported not enforced; see recommendation 3 for what they prove.)
- **No external anchor / transparency log.** Nothing records the head hash or
  event count outside the mutable `logDir` — defeats T1, T2, T6.
- **No monotonic counter / sequence number** in the hashed fields — weakens T4/T5.
- **No timestamp-monotonicity check** in `verifyChain`.
- **No full-payload hash.** ~Half the schema is unhashed — defeats T7.
- **No "expected to be chained" assertion.** Un-chained logs report OK — defeats T8.
- **No independent/out-of-band verifier.** Verifier shares code & process with
  the logger — defeats T9.
- **No WORM / OS-immutability** (`chattr +a`, append-only object storage).

---

## 6. Recommendations

Ranked by risk-reduction-per-effort. All are **out of scope for this doc**
(per the issue) and should be filed as separate issues per
`.rules/track-deferred-work.md`.

1. **Hash the full event payload, or explicitly document the hashed subset as a
   contract.** Add the remaining schema fields (esp. `metadata`,
   `policyDecision`, `violationType`, `resource`, `severity`, `timestampMs`) to
   `computeEventHash` (`audit-logger.ts:45`). Closes **T7** outright, low effort.
   (Note: changing the hashed set is a chain-format migration — version it.)

2. **External anchor of the head hash + event count.** Periodically write
   `{ lastHash, eventCount, timestamp }` to an append-only/remote/WORM store the
   logger process cannot rewrite (e.g. object storage with object-lock, a
   transparency log, or even a separate signed file on a different host).
   `verify_audit_chain` then asserts the recovered head matches the latest
   anchor and the count is ≥ the anchored count. Closes/raises the bar on **T1,
   T2, T6** and most of **T3/T5**. Highest-value, medium effort.

3. **Keyed integrity (HMAC-SHA256) or per-event signatures.** Replace keyless
   SHA-256 with HMAC under a key held outside the audited process (KMS/HSM/env
   not readable by the agent). A process adversary without the key can no longer
   rehash. Directly closes **T3**; combined with (2) closes the rewrite class.
   Higher effort (key management).

   > Partially adopted for the committed VOTE ledger (`vote-record.ts`, #3927
   > item 4, phases 1-2). A record may carry `signature`: an `ssh-keygen -Y
sign` signature, namespace `nexus-vote-record`, over the record's
   > committed `hash` string (never re-serialised JSON), verified against the
   > committed `governance/allowed_signers` with its validity windows. The
   > append script signs when a key is configured; the gate reports the
   > verifier's code per record (`signed by` / `unsigned-record` /
   > `unknown-signer` / `bad-signature` / `signature-not-measured`) and does
   > not yet fail on it — phase 3 enforces past a committed cutover sequence.
   >
   > **What a signature proves, and what it does not.** `signed` proves that
   > whoever ran the append had access to a listed private key from that
   > environment. It does NOT prove a human was present or ratified anything.
   > Measured, 2026-09-14: the agent process signed ledger commit `4a5acd562f`
   > with the operator's cached GPG key and no prompt was shown; the agent
   > that implemented this feature then signed a probe with the operator's
   > ssh-agent-loaded ed25519 key — the very key in `allowed_signers` — the
   > same way. Under that custody a signature is a stronger hash (it closes
   > the rewrite-and-rehash from a process WITHOUT the key), not a
   > ratification (it does nothing against a process WITH it, which is the
   > agent). Making it mean more is a key-custody question — a hardware-backed
   > key with presence confirmation, or a CI/OIDC identity for machine-made
   > records — tracked as #6257, not pretended away here.
   >
   > **#6257 increment 1 (panel 2026-09-15, option B): attribution, not
   > custody.** The autonomous loop now signs with its OWN ed25519 key
   > (`~/.nexus-agents/auth/vote-record-signing.key`, no passphrase,
   > generated by `scripts/vote-record-keygen.ts`, listed as
   > `nexus-agent@<host>`), and the owner's key is reserved for records a
   > human appended: the append script refuses an owner-principal signature
   > unless `--as-owner` is passed. The verifier returns the principal and
   > its kind, never a bare boolean, and the gate prints `signed:agent` /
   > `signed:owner`. What that buys: a record now says WHICH PROCESS
   > appended it, and a run that inherited the operator's key by accident
   > cannot claim human presence. What it does NOT buy, stated plainly: host
   > isolation. Both keys live on the operator's host; a process adversary
   > there (T3) can read both and sign as either, so the split adds no
   > non-repudiation against host compromise, and the `--as-owner` refusal
   > stops an accidental owner claim, not a deliberate one. A hardware-backed
   > key was rejected (it re-humanizes every governor merge, against the
   > north star); CI/OIDC-issued short-lived keys for a CI-run append are
   > #6350; phase-3 enforcement — every base-ref record past a grandfather
   > cutover signed by a known principal, and a human-ratification claim
   > signed by the owner principal — is #6279.

4. **Add a monotonic sequence number to the hashed fields and enforce
   monotonic, non-decreasing `timestampMs` in `verifyChain`.** Strengthens
   **T4** and makes gaps in **T5** visible even when re-stitched (a gap in the
   sequence is detectable). Low–medium effort.

   > Partially adopted in the SET-based record stores (`vote-record.ts`,
   > `pr-review-record.ts`, #3927): records carry a monotonic `sequence`, and
   > `verify*RecordSet` flags any hole in the `0..maxSeq` run as `sequence_gap`.
   > **Known residual gap (#4011):** because duplicate sequences are a benign
   > concurrent-fork signal, deleting ONE partner of a fork leaves the survivor on
   > that sequence — no gap, so verification still returns `ok`. Sequence-gap
   > omission detection therefore does NOT cover a deleted fork partner. This sits
   > within the residual-trust boundary (records are author-typed and unsigned);
   > closing it requires per-record signing (rec #3 / #3927 item 4), not the
   > sequence mechanism alone.

5. **Make `verify_audit_chain` fail-closed on an un-chained log when chaining is
   expected.** _Partly done._ #4773 added `notVerified: 'empty' | 'unchained'`
   (`audit-logger.ts:192-195`), which removed the ambiguous "OK" of **T8** — the
   reporting half of this recommendation. #4788 added `skippedLines` /
   `unreadableFiles` so partial reads are visible too. What remains is the
   fail-closed half: nothing compares the log's chained-ness against a policy
   that expects chaining, so a caller reading only `ok` is still misled. Low
   effort — thread the expected-chaining policy into the tool and refuse.

6. **Independent out-of-band verifier + WORM storage.** Run a verifier built
   from a separate codebase/host over an externally-anchored, append-only copy;
   use OS/object-store immutability for the live log. Mitigates **T9** and
   hardens **T1/T3**. Highest effort; appropriate once 1–3 land.

---

## 7. Evidence linkage

This document is the adversarial-analysis evidence backing the audit-integrity
governance claim asserted in `CLAUDE.md` and `AGENTS.md`. Its honest conclusion —
the chain is **tamper-evident, not tamper-proof** against a write-capable
adversary — **has since been reflected in those governance files**: they no
longer use the unqualified word "immutable" (a grep of `CLAUDE.md` and
`AGENTS.md` returns zero occurrences) and now describe the audit chain as
"tamper-evident, not tamper-proof," linking back to this threat model. The claim
lives as prose in those two governance files, and this doc is linked from the
canonical index (`docs/README.md`).

## 8. Sanctioned edit: redaction of voter reasoning in the vote ledger (#5748)

This section covers the one edit the SET-based vote ledger
(`governance/vote-records.jsonl`, `packages/nexus-agents/src/audit/vote-record.ts`)
admits on purpose. Everything above says the chain is tamper-**evident**: any edit
to a persisted record is a `hash_mismatch`. A redaction facility is by
construction an edit, so it has to be reconciled with that claim rather than
bolted beside it.

### 8.1 What a redaction is

Since schema tier 1.13 (#6263) a voter entry commits to its model-written
reasoning instead of hashing the text: it carries a per-entry salt
`reasoningNonce` (32 random bytes) and `reasoningDigest = sha256(nonce ‖ text)`,
and the record hash folds **only the digest**. The text and the nonce — the
_opening_ of the commitment — travel on the record outside the hash, and the
verifier re-opens the commitment whenever both are present, so an edited text
is still a `hash_mismatch`.

A redaction (#6264) drops the opening — text **and** nonce, together — for the
named voter roles and leaves the digest. Two consequences follow from the fold
rule, and both are asserted as hash-value equality in
`redaction-record.test.ts`:

- The target record's `hash` is **unchanged**. Anything signed over it (#3927
  item 4, when signing lands) verifies unchanged; nothing is re-hashed or
  re-signed.
- With the 256-bit nonce gone, the digest is an opaque commitment: there is no
  offline `sha256(nonce ‖ guess)` check against low-entropy boilerplate
  reasoning. (This is why the #6274 panel moved the nonce outside the hash — a
  hashed salt could not be dropped, and a public one would be a dictionary
  target.)

### 8.2 What makes it an edit rather than tampering: the redaction record

A self-hashed **redaction record** is appended at the ledger's next `sequence`:

```json
{ "kind": "redaction", "id": "…", "sequence": N, "targetId": "<vote record id>",
  "targetVoterRoles": ["security"], "at": "<ISO-8601>", "by": "<actor>",
  "reason": "<why>", "hash": "<sha256 over every field above>" }
```

It occupies a sequence like any record (a hole before it is a `sequence_gap`; a
shared sequence is a benign fork), its hash covers every field (an edited
`reason` or `by` is a `hash_mismatch`), and it is what the verifier consults.
`verifyVoteRecordSet(records, redactions)` gives a **third per-record answer**
beside `ok` and `hash_mismatch`:

| Shape of the entry                                              | Verdict                                                                       |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| digest present, opening absent, a redaction record names it     | `ok`, with the record listed under `redacted` (roles and redaction ids named) |
| digest present, opening absent, **no** redaction record         | `hash_mismatch` — the named empty case; a silent drop is tampering            |
| redaction record whose `targetId` or role binds to no entry     | `redaction_unbound` — never `ok`                                              |
| redaction record naming an entry whose opening is still present | `redaction_unbound` — recorded but not applied is a misreport                 |
| redaction record whose `sequence` is not past its target's      | `redaction_unbound` — an honest ledger appends it only after the target       |
| two redaction records naming the same entry                     | idempotent: `ok`, both ids listed (a `merge=union` fork of the right action)  |

The governor ratification gate (`scripts/governor-ledger-evidence.ts`) treats a
`redacted` ratifying record as verifiable — its decision, tally, strategy,
policy and panel coverage are all still hash-covered — and prints the
redaction on the `::notice::` line so a spot-checker who goes looking for the
reasoning finds "removed under redaction record 'X'" rather than nothing.
The append-only rule admits removal of `reasoning` and `reasoningNonce` only
from roles named for that target by a redaction record newly appended in head,
comparing the target canonically; every other change remains a rewrite.

### 8.3 What a redaction does and does not remove

Removes, from the ledger's **current state**: the voter's reasoning text and
its salt. Keeps, hash-covered and legible: every tally field, the decision, the
clip marker `reasoningTruncated`, the digest, and the redaction's own
who/when/why.

Does **not** remove:

- **Git history.** A plaintext already committed stays in every earlier commit
  of `governance/vote-records.jsonl` until a history rewrite, which the ledger
  tooling does not perform and which is out of scope here; the redaction
  script's README (#6265) states this and the procedure.
- **Copies elsewhere** — the runtime store under `.nexus-agents/`, job
  sidecars, PR tally comments, CI logs. A redaction is scoped to one ledger.
- **The fact that the voter argued.** The digest and the marker remain; only
  the words are gone.

### 8.4 Landing a redaction through the ratification gate (#6348)

`scripts/governor-ledger-evidence.ts` preserves every base ledger line in
relative order, admitting the target-opening removal described in §8.2 only
when the authorizing redaction record is present in head and absent from base.
For that target, it compares parsed JSON with stable key ordering after
removing only the named roles' openings from the base; any other value
change or an unparseable counterpart is `ledger-rewritten`.
Lines no new redaction names remain byte-exact, including key order.

The base comparison runs before ledger verification, so an unauthorized
removal is reported as `ledger-rewritten` even if it also breaks a commitment.
The head must still pass the verifier's self-hash, sequence and redaction
binding checks, and the PR still requires owner ratification.

### 8.5 Trust boundary

A redaction record is author-typed under the same residual-trust boundary as
every other record (§2, T3): an actor with write access can append one, and
`by`/`reason` are whatever that actor wrote. What the mechanism guarantees is
narrower and exact — a removal is either **recorded** (verifiable, listed as
`redacted`, attributable to a line that names an actor and a reason) or it is
**flagged** (`hash_mismatch`). There is no third state in which a voter's
argument vanishes and the ledger still reads as clean. Raising the bar on who
may append a redaction is signing's job (rec #3), not the verifier's.

## References

- Implementation: `packages/nexus-agents/src/audit/audit-logger.ts`
- Vote ledger + redaction (§8): `packages/nexus-agents/src/audit/vote-record.ts`,
  `packages/nexus-agents/src/audit/reasoning-commitment.ts`,
  `packages/nexus-agents/src/audit/redaction-record.ts`
- Event schema: `packages/nexus-agents/src/audit/audit-types.ts`
- Storage: `packages/nexus-agents/src/audit/audit-storage.ts`
- Verifier tool: `packages/nexus-agents/src/mcp/tools/verify-audit-chain-tool.ts`
- Related: [V2 Pipeline threat model](../v2/threat-model.md)
- Origin: Issue #3832 (Epic #3829)
