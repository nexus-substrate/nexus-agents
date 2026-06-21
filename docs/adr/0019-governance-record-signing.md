---
title: 'ADR 0019: Governance-Record Signing'
description: Design-of-record for signing governance records (vote-records, pr-review-records) — CI-commit-time Sigstore/cosign keyless signing that attests provenance-through-CI, with Rekor inclusion verification mandatory and the build explicitly deferred to the record producer plus a multi-party-review threat model.
tier: 3
keywords:
  [
    signing,
    sigstore,
    cosign,
    keyless,
    oidc,
    rekor,
    governance,
    vote-records,
    pr-review-records,
    provenance,
    tamper-evident,
    deferred,
    trigger,
    adr,
  ]
---

# ADR 0019: Governance-Record Signing

**Status:** Accepted (design-of-record); **IMPLEMENTATION DEFERRED** to the build trigger.
**Date:** 2026-06-20
**Context:** #3897 — "Ratification ledger verifies presence, not authenticity." Residual
flagged by every voter on the #3895 (7/7) ratification: governance records are
tamper-evident but hand-committable, so a gate verifies _presence_, not _authenticity_.
**Ratification:** `consensus_vote`, **APPROVED 7/0**, recording the keyless
OIDC/Sigstore direction (Architecture A) and the deferred build trigger below.

## Decision

**Architecture A — CI-commit-time Sigstore/cosign keyless signing.**

Governance records (`vote-records.jsonl`, `pr-review-records.jsonl`, and the
ratification ledger they back) remain **content-hash tamper-evident** at local
production time. They gain authenticity **at commit time, in CI**: when a record is
committed in a PR, a GitHub Actions workflow running under **the repository's OIDC
identity** signs the committed record bytes via **Sigstore/cosign** (keyless —
short-lived certificate from Fulcio bound to the workflow's OIDC token, no long-lived
key material). The signing produces a Sigstore bundle (certificate + signature +
Rekor transparency-log entry).

The governor gate (the #3831 governor-path gate consumer) then verifies, for any
governance record it relies on:

1. **Workflow OIDC identity** — the Sigstore certificate's identity matches the
   **expected** repository workflow identity; a signature from any other Actions run,
   any other workflow, or any other repository fails.
2. **Payload binding** — the signed payload bytes are **byte-identical** to the
   committed record bytes (this preserves the Option-C content-diff binding ratified
   for the producer; the signature attests _this exact record_, not a paraphrase).
3. **Rekor inclusion** — the record's entry is present and verifiable in the Rekor
   transparency log (external witness; see _Honest value assessment_).

A record that lacks a valid bundle satisfying all three is not authentic to the gate.

### Rejected alternatives

- **B — Interactive per-produce keyless login.** Sign at _local production_ time via an
  interactive OIDC login (`cosign sign` against the developer's identity). Rejected:
  the records are produced locally where there is **no CI OIDC identity**, an
  interactive browser login per produce is high-friction, and — decisively — it is
  **un-CI-testable** (no end-to-end path a gate can exercise without a human at a
  browser). It signs "a developer was logged in," which is weaker than "entered the
  ledger through sanctioned CI."
- **C — Hybrid (local content-hash + CI signature + a second human-attestation layer).**
  Rejected as **premature**: there is no multi-reviewer / external-contributor consumer
  today to attest _to_, so the second layer would be machinery with no reader. Revisit
  only if the build trigger's threat model materializes.

## Context

Governance records are **tamper-evident** today: each is a keyless SHA-256 content hash
over the record bytes, so any post-hoc edit to a committed record is detectable against
its hash (the same tamper-evident-not-tamper-proof posture as the
[audit hash-chain](../security/audit-hash-chain-threat-model.md)). What they are **not**
is **forgery-proof**: as #3897 found, the ledger is **hand-committable**, so any actor
who can land a commit can author a _conforming_ entry. A content hash proves the bytes
have not changed since _someone_ wrote them; it does not prove _who_ wrote them or
_how_ they entered the ledger. The gate therefore verifies **structural presence** of
an approved record, not its **authenticity**. The trust anchor today is PR review of
the record (CODEOWNERS on `governance/` + branch protection) — a human, not a machine.

Two facts shape the design:

- **The owner chose keyless.** Signing direction is **keyless OIDC/Sigstore** (no
  long-lived signing key to manage, rotate, or leak; short-lived Fulcio certs bound to
  an OIDC identity; Rekor as the transparency witness). This rules out a long-lived-key
  PKI design before options are weighed.
- **Records are produced locally but committed via caller-commits.** Production happens
  on a developer machine that has **no CI OIDC identity** to sign under; the record then
  reaches the repository through the **caller-commits** path (the producer writes the
  record set locally; a PR commits it). The only place a _sanctioned, attestable_
  identity exists in this flow is **CI at commit time** — which is exactly where
  Architecture A signs.
- **The producer is deferred.** The record producer itself — the component that would
  emit `vote-records.jsonl` / `pr-review-records.jsonl` at vote/review time as a
  tamper-evident keyless-hash record _set_ (Option C content-diff binding ratified) — is
  **deferred** (#3831 / #3927). There is, today, **no populated record stream** to sign.

## What it attests (explicit and honest)

A CI-commit-time signature attests exactly one thing: **provenance-through-CI** —

> _this exact record entered the ledger through this repository's sanctioned CI,
> under identity X._

It does **NOT** attest **who reviewed** anything, and — stated plainly — **it does not
prove that a human reviewed the record at all.** A signature proves the record's bytes
passed through the repo's CI identity; it says nothing about whether a person read,
judged, or approved the underlying vote or PR review. Conflating "signed by CI" with
"reviewed by a human" is the failure mode this ADR refuses to commit: the attestation
is about _the path into the ledger_, not _the judgment behind the content_. The
ADR/docs MUST state this (binding condition 4).

## Honest value assessment

For a **single local owner-operator** — the situation today — CI-identity signing is
**largely marginal** over what already exists: a keyless SHA-256 content hash, CODEOWNERS
on `governance/`, and branch protection. If the same person produces the record, lands
the commit, and owns CI, a CI signature mostly re-attests a chain they already control.
**Today, in isolation, it is near-theater.**

The genuine delta requires **both** of:

- **(i) Rekor inclusion verification.** Without Rekor, the design collapses to "a record
  was signed by an ephemeral cert that has since expired" — there is no durable,
  external witness, so an after-the-fact ledger forgery is not independently detectable.
  **With** Rekor inclusion verification, the transparency log is an external witness:
  a forged or rewritten ledger entry is detectable after the fact because the authentic
  entries are publicly logged and the forged one is not. This is why Rekor verification
  is **mandatory**, not optional — it is the part that carries the real security value.
- **(ii) Multi-party / external-contributor review.** Provenance-through-CI is _real_
  value precisely when the producer/committer is **not** the sole trust anchor — when an
  external contributor or a second reviewer is in the loop and "did this record actually
  enter through our sanctioned CI, or was it hand-forged into the PR?" is a question with
  a non-trivial answer.

Absent (i), there is no external witness; absent (ii), there is no adversary the
provenance defends against. The build is gated on **both** appearing (see _Sequencing_).

## Sequencing / build trigger

**DESIGN NOW (this ADR) / BUILD WITH THE PRODUCER.** This ADR is the _design-of-record_;
it ships no code.

The **build trigger** is the conjunction of:

1. **The deferred record producer lands** (Option C, #3831 / #3927) — there is a real,
   populated record stream to sign, with the content-diff binding in place; **AND**
2. **A multi-party-review threat model materializes** — external contributors or more
   than one reviewer, i.e. the (ii) condition above is actually present.

Building before then repeats the **capability-bias** that already deferred the producer:
implementing a signing pipeline with no populated record stream means **signing fixtures**
— there is no end-to-end test path, the gate verifies invented payloads, and the system
gains a maintenance surface and a false sense of authenticity for a single-operator setup
where the assessment above says the value is marginal. Design captures the decision so it
is ready; the build waits for the producer and the threat model that make it worth more
than its cost.

## Binding conditions for the eventual build

When the trigger fires, the implementation MUST satisfy all of:

1. **Pinned workflow OIDC identity.** The gate pins the **expected** repository workflow
   OIDC identity; a bundle signed by **any other** Actions run, workflow, or repository
   fails verification. Identity match is not advisory — it is the gate.
2. **Payload-bytes binding.** The gate verifies the **signed-payload bytes ==
   committed-record bytes**, preserving the Option-C content-diff binding (the signature
   attests _this exact record_, not a re-serialization or a paraphrase).
3. **Mandatory Rekor inclusion verification.** Rekor transparency-log inclusion
   verification is **required**; a bundle without verifiable Rekor inclusion is rejected.
   Without it the design is an ephemeral cert with no external witness (see _Honest value
   assessment_).
4. **Honest attestation wording.** The ADR/docs state that the signature attests
   **provenance-through-CI, not human review** — the build does not market it as proof a
   human reviewed.

## Consequences

### Positive

- The authenticity gap #3897 found has a **ratified design** behind it: when the producer
  lands, the path from "presence-only" to "provenance-verified" is already specified
  (identity pin + payload binding + Rekor), not re-litigated under deadline.
- **Keyless** — no long-lived signing key to manage, rotate, or leak; short-lived Fulcio
  certs; Rekor as the durable witness. Aligns with the owner's chosen direction.
- The design is **honest about its limits** up front: provenance-not-review, and
  marginal-for-single-operator. It will not be oversold when built.
- **No premature code.** No fixtures-only signing pipeline, no maintenance surface, no
  false authenticity added to a single-operator setup today.

### Negative

- The authenticity gap **remains open until the build trigger fires** — until then the
  trust anchor is still PR review of the record (CODEOWNERS + branch protection).
  <br>**Update (#4005/#4010):** the resolution source moved from the hand-committable
  `governance/ratification-votes.yaml` (now **removed**) to the authentic, tamper-evident
  `governance/vote-records.jsonl` (verified by `verifyVoteRecordSet`); CODEOWNERS review on
  `governance/` is the trust anchor that must stay in place. The original #3897 reasoning below
  is preserved as the historical record.
- A future build carries real cost: a signing workflow, bundle verification in the gate,
  Rekor availability as a CI dependency, and the operational story for Rekor/Fulcio
  outages — costs this ADR defers but does not remove.
- "Design now, build later" risks the design drifting from the producer's eventual shape;
  binding conditions 1–4 are the anchor that the build must satisfy regardless of drift.

### Alternatives considered (summary)

- **A (chosen)** — CI-commit-time Sigstore/cosign keyless signing. Signs where the only
  sanctioned identity in the caller-commits flow exists (CI), is CI-testable end-to-end,
  and — with Rekor — gains an external witness.
- **B (rejected)** — interactive per-produce keyless login. No CI identity locally,
  high-friction, un-CI-testable.
- **C (rejected, premature)** — hybrid with a second human-attestation layer. No
  multi-reviewer consumer exists to attest to yet.

## References

- Issue: [#3897](https://github.com/nexus-substrate/nexus-agents/issues/3897) — ratification
  ledger verifies presence, not authenticity (this ADR's origin; residual from the #3895 7/7 vote)
- Governor gate: [#3831](https://github.com/nexus-substrate/nexus-agents/issues/3831) — require a
  recorded `pr_review` (audit-trail) for PRs touching governor paths (the gate consumer)
- Producer / hardening: [#3927](https://github.com/nexus-substrate/nexus-agents/issues/3927) —
  enforce + harden authentic vote records (deferred producer; "add signing" follow-up)
- Threat-model lineage: [audit hash-chain threat model](../security/audit-hash-chain-threat-model.md)
  — tamper-evident, not tamper-proof
- Related ADRs: [ADR-0017](./0017-authority-ladder.md) (authority ladder — the ratification
  records this signing would authenticate)
