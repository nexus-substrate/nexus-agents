---
'nexus-agents': minor
---

`consensus_vote` now names the working directory its seats were pointed at (#6258). The response carries an optional `workspace` field: the caller's checkout (the CLI's ratification scratch checkout) or, when none was given, the server's working directory. `nexus-agents vote` prints the same value on a `Workspace:` summary line. When a seat comes back `unverifiable`, you can now see which directory it was given without reading stderr. A simulated panel gives no seat a directory, so the response omits the field and the summary line reads `Workspace: none (no live seat was pointed at one)`. The persisted vote record is unchanged.
