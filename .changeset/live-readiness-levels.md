---
'nexus-agents': minor
---

`nexus-agents doctor --live` verifies an adapter actually serves a completion ([#4376](https://github.com/nexus-substrate/nexus-agents/issues/4376), #4351 criterion 7).

Nothing in the tree could confirm that an adapter which _looks_ healthy can serve anything. `healthCheck()` proves the binary exists at a supported version; `cli-auth-probe` proves credentials are present and unexpired and says so explicitly — "No live API calls." Neither proves serving. That is exactly the #4351 state: every voter returned `stop_sequence` with zero tokens while every available check reported healthy.

A readiness ladder now names what each level proves:

| level           | proves                                          | costs |
| --------------- | ----------------------------------------------- | ----- |
| `installed`     | binary present at a supported version           | none  |
| `authenticated` | credentials present and unexpired, read locally | none  |
| `serves`        | a real completion returned content              | quota |

`serves` runs only under `--live`, because it spends the resource it measures. Chosen by a 7-voter `higher_order` panel (5 of 6): the rejected alternative cached a probe behind a TTL on the default path, which is a stale measurement presented as current readiness — the same defect the ladder exists to remove.

**A level that was not run reports `not-attempted`, never `failed` or passed.** That distinction is the point: a default run must not read as a clean bill of health for serving it never tested, which is how #4351 stayed invisible.

The probe fails on **empty content**, not just on a non-zero exit — an adapter returning `ok` with zero tokens has not served, and reading that as ready reproduces the incident. Each probe is bounded by the `interactive` operation-class guard; a timeout is reported as not-ready rather than hanging.

Also corrects `--deep`'s help text, which claimed "adapter connectivity". It reports learning-loop, data-sufficiency and routing diagnostics, and makes no adapter calls at all.

Verified against the four real adapters: claude/gemini/codex `verified` in 4–11s, and **opencode `failed` — "Key limit exceeded"**: installed, authenticated, and unable to serve. Precisely the class of failure no existing check could see.
