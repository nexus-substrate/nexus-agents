---
'nexus-agents': minor
---

let `nexus-agents vote` declare named options, so a multi-option decision records which one won

The engine has recorded `optionTally` and `optionCoverage` since #4472, and the
CLI had no way to supply the options they measure. Every multi-option vote run
from a terminal persisted as a bare `approved` with `optionTally: null` — the
panel deliberated over three alternatives and the record could not say which it
chose.

`--option` is repeatable (2-10, enforced by the existing schema). Omit it and
behaviour is unchanged: the field is left off entirely rather than sent as an
empty array, because the engine treats a present `options` array as "this is a
multi-option vote" and adds the leading-option bar on top of the ordinary
approve/reject one.

No short flag. Every free letter is taken, and the two collisions that already
existed silently bound the wrong option (#4922).
