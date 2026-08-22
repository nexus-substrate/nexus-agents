---
'nexus-agents': patch
---

Measure the harness tmpfs too, not just the nexus scratch root ([#4488](https://github.com/nexus-substrate/nexus-agents/issues/4488)).

`nexus-agents doctor`'s scratch-space check was written for the #4488 outage — a 32 GiB tmpfs at `os.tmpdir()` hitting 100%, after which every subprocess died at the _write_ step with its work already done. But the check measured `getNexusTmpDir()`, which defaults to `<dataDir>/tmp` inside the repo. On the reporting machine that is a 912 GiB volume with 225 GiB free.

So the check graded `ok` for the entire duration of the incident it exists to catch. It could not fail for its own motivating failure — the two filesystems are simply different, and it only ever looked at the roomy one.

`checkScratchFilesystems()` now measures both the nexus scratch root and the system temp dir, deduplicated by device id so a single-volume machine still reports one line. `worstSeverity()` grades on the worst reading, so a roomy nexus root can never mask a starved shared one. A root whose device cannot be resolved is dropped from the report rather than assumed healthy — unmeasured is not `ok`.

Live output on the reporting machine, where the two roots are on different volumes:

```
✓ Scratch space [nexus] (…/.nexus-agents/tmp): 224.9 GiB free of 912.8 GiB (75% used)
✓ Scratch space [system] (/tmp): 18.6 GiB free of 31.3 GiB (40% used)
```

`DoctorResult.scratchSpace` is now a list of readings rather than a single reading.
