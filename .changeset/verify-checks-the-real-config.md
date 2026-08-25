---
'nexus-agents': patch
---

make verify's Configuration check read the real config file

`checkConfigLoading` read two properties off `defaultConfig`, a compiled-in
imported constant. That cannot throw once the module has imported, so the
failure branch added by #4181 was unreachable and both live branches returned a
pass. A user with a malformed `nexus-agents.yaml` ran `verify` and saw
Configuration succeed — no file was ever opened.

#4181's own remediation text described the check it wanted ("if a local config
override exists, check it for syntax errors"); the implementation hardened the
verdict one layer away from the thing that can break.

It now calls `loadConfig()` and reports three distinguishable outcomes: a parse
or validation failure as a `warn` carrying the loader's message, a loaded file
by path with its warning count, and — the common case — no config file as a
pass that says defaults were used rather than implying a file was validated.

Fixes #4844.
