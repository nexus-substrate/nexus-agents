---
'nexus-agents': patch
---

Select audit repositories only from explicit GitHub URLs, `repo:` / `repository:` markers, or concise `owner/repo` and `audit owner/repo` tasks. Absolute and explicitly relative artifact paths, filenames, and unrelated prose no longer become GitHub repository targets. Invalid, absent, or conflicting targets fail the audit before remote calls and prevent a successful report.

For longer audit tasks, name the repository with a marker or GitHub URL. Explicit dotted repository names remain supported; the existing bare `.git` and URL normalization behavior is preserved.
