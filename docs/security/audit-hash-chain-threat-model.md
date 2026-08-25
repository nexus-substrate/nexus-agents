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

## 1. Design

### 1.1 What an entry is

Each audit event is an `AuditEvent` (schema: `audit-types.ts:99`). Events are
written one-per-line as JSON-L into rotating `audit-<date>-<time>.jsonl` files
by `FileAuditStorage` (`audit-storage.ts:268` `write`, `:201` `generateFileName`).

### 1.2 How entries link (`prevHash` → `hash`)

Hash chaining is controlled by `enableHashChain`, which **defaults to `true`**
(`audit-types.ts:182`).

When an event is created (`audit-logger.ts:224` `createEvent`):

1. `event.previousHash` is set to the logger's running `this.lastHash`
   (`audit-logger.ts:~346`). The very first event in a logger's lifetime has
   `previousHash === undefined`.
2. `event.hash = computeEventHash(event)` is computed and `this.lastHash` is
   advanced to it (`audit-logger.ts:~356-357`).

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
  `audit-types.ts:191`). Dropped events never reach the chain at all.

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

**Vector.** The first event of a logger's lifetime has
`previousHash === undefined` (`audit-logger.ts:247`); there is nothing before it
to bind to. An adversary can substitute a fabricated "genesis" event, or splice
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
(`audit-types.ts:182`) so no hashes are ever written. (b) Adversary makes the
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
- **No signing.** Events and checkpoints are unsigned.
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

## References

- Implementation: `packages/nexus-agents/src/audit/audit-logger.ts`
- Event schema: `packages/nexus-agents/src/audit/audit-types.ts`
- Storage: `packages/nexus-agents/src/audit/audit-storage.ts`
- Verifier tool: `packages/nexus-agents/src/mcp/tools/verify-audit-chain-tool.ts`
- Related: [V2 Pipeline threat model](../v2/threat-model.md)
- Origin: Issue #3832 (Epic #3829)
