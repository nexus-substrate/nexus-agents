---
'nexus-agents': patch
---

A consensus seat that quotes a sandbox or repository-read error but then reports it recovered keeps its vote instead of being recorded as `unverifiable`.

Since 8.52.x a voter whose reasoning matched a read-failure string — `bwrap:`, `RTM_NEWADDR`, "repository reads failed", "could not read the artifact" — was re-recorded as `unverifiable` with its decision discarded, even when no stderr signal was present. That was the safe direction, but it swallowed a measurable class of good seats: "first shell attempt printed 'bwrap: …', but the retry succeeded and I read all three files" lost its vote, and so did "repository reads failed with a transient EAGAIN; the second attempt succeeded".

The stderr signal is unchanged and still wins. The reasoning fallback now fires only when the reasoning begins with the `UNVERIFIABLE:` prefix the voter prompt asks a blind seat to write, or when an error string is present and the reasoning does not also assert a successful read — a `path/file.ext:LINE` citation or a recovery phrase ("retry succeeded", "second attempt succeeded", "then read", "was able to read"). The six real ledger entries that motivated the fallback are still classified `unverifiable`; the recorded `unverifiableSignal` value for the fallback stays `reasoning`, and a debug log now names which sub-rule fired (`prefix` or `error_without_recovery`).
