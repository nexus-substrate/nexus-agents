---
'nexus-agents': patch
---

`registry refresh` now enforces its 5 MiB download cap via streaming with early abort, instead of buffering the entire body before checking the size (#3354). It rejects on an over-cap `Content-Length` before reading a byte, and otherwise reads the body through a running byte counter that cancels the stream the moment the cap is exceeded — so a compromised or mistyped mirror serving a multi-gigabyte (or undeclared-length) body can no longer exhaust process memory before the guard fires.
