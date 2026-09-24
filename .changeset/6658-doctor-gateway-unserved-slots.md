---
'nexus-agents': patch
---

`doctor`: a passing gateway no longer excuses every missing CLI (#6658). A missing CLI whose slot resolves to a gateway model is still excused. A missing CLI whose slot has no gateway model, and a missing opencode (which never has one), is now printed as a named warning such as `claude slot unavailable: not installed, and the gateway has no anthropic model`. Such a CLI does not fail the verdict while at least one family slot is served. A gateway that serves no claude, codex or gemini slot now fails the verdict, because every pinned slot would throw "unavailable" at use. This applies to a catalogue with only unrecognised-family chat models, and to `--probe` returning `no_model` for every family. `doctor --gateway` lists each unserved slot.
