---
'nexus-agents': patch
---

`pr_review` audit records now decide `bindingBounds` and the reviewed-diff truncation warning from the bytes `reviewedDiffHash` actually covers (#6177). On the MCP path the middleware hashes the RAW diff before sanitizing it, while the coverage stamp was measured over the sanitized text the handler received; a raw diff over the 50,000-byte binding cap whose sanitized form was under it was recorded as `binding covers all N bytes` beside a hash that had truncated, and the truncation warning stayed silent.

The secure-handler middleware now reports `rawFieldBytes` (the UTF-8 length of each raw-hashed field) beside `rawFieldHashes`, `ReviewSanitizationInput` carries `rawDiffBytes` and `rawTruncated`, and the packer takes a `BindingMeasurement` instead of measuring `prDiff`. The summary stamp says which bytes the binding figure is over — `(raw)` on the MCP path, unchanged wording when no sanitizer was in the path, and `(sanitized; raw length not supplied)` when a sanitizer ran without measuring, which is also logged as a warning. The `coverage` object on the tool response gains `bindingSource` with the same three values. `coverage.totalBytes` remains the panel-read denominator (the text the panel was sent); `bindingBounds.boundBytes` is now measured over the raw input, so the two can differ by the bytes the sanitizer stripped.
