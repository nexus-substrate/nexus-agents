---
title: Scratch filesystem exhaustion runbook
description: Symptom, diagnostic, and recovery for a full /tmp during a long autonomous run — every subprocess fails after doing its work, so the output is lost rather than the command refused.
tier: 2
keywords: [ops, tmpfs, tmp, disk, scratch, ENOSPC, autonomous, doctor]
---

# Scratch filesystem exhaustion runbook

## Symptom

Mid-session, every tool call starts failing. The message names a temp path rather than the thing you were doing:

```
the temp filesystem at /tmp/claude-1000/.../tasks is full (0MB free)
```

What makes this hard to recognise: **the failure happens at the write step, after the work is done.** A subprocess runs to completion and then dies trying to record its output, so the symptom is a lost result, not a refused command. During a long autonomous run it reads as unexplained tool flakiness — the wrong diagnosis, pursued for a while before anyone checks disk.

The other tell is that it is not one tool. If several unrelated commands fail in a row and none of them mentions your code, check the filesystem before debugging anything else.

## Diagnostic

```bash
df -h /tmp
du -sh /tmp/* 2>/dev/null | sort -rh | head
du -sh /tmp/claude-1000/*/* 2>/dev/null | sort -rh | head
```

`/tmp` is commonly a **tmpfs** — memory-backed, fixed-size, and invisible in the ordinary "is the disk full" reflex, because the root volume can have hundreds of gigabytes free while `/tmp` sits at 100%.

The dominant consumer is usually agent-session scratch: subagent and background-task JSONL transcripts, which are large and accumulate per session. During the 2026-08-18 incident, `/tmp/claude-1000` held **145 session directories**, and the bulk belonged to sessions from unrelated projects.

## Recovery

Delete the transcripts, which are the bulk and are not needed once a session has ended:

```bash
find /tmp/claude-1000 -name '*.output' -type f -delete
```

Then re-check `df -h /tmp`. If that is not enough, remove whole session directories — **only ones you know are finished**:

```bash
ls -lt /tmp/claude-1000/*/ | head          # oldest last
rm -rf /tmp/claude-1000/<project>/<session-id>
```

Deleting another project's live session directory breaks that session. This is not something an agent should do on its own: it is a destructive operation outside any single session's blast radius, and it belongs on the human side of the hard-stop line. An agent may safely delete its **own** session's `*.output` files and nothing else.

## Prevention

`nexus-agents doctor` reports headroom on both scratch filesystems:

```
nexus   .../.nexus-agents/tmp   229.0 GiB free of 912.8 GiB (75% used)   ok
system  /tmp                     10.7 GiB free of 31.3 GiB (66% used)    ok
```

Both are measured deliberately. An earlier version of the check measured only the nexus scratch root, which on the reporting machine sits on a 900 GiB volume — it graded `ok` throughout the outage while the 32 GiB tmpfs it was not looking at was full. The roots are deduplicated by device id, so when both live on one filesystem it still prints one line, and the overall grade is the **worst** across filesystems so a roomy root cannot mask a starved one.

Run `doctor` before a long autonomous session, not only when something breaks.

## Related

- #4488 — the incident this runbook records
- #4631 — age-based reaper for scratch under `NEXUS_TMPDIR`
- #4412 — moved nexus-agents scratch to `<dataDir>/tmp`
- [`cli/doctor-scratch-space.ts`](../../packages/nexus-agents/src/cli/doctor-scratch-space.ts) — the check
