---
'nexus-agents': patch
---

index: `links` fails instead of reporting "all OK" when it read no files (#5849)

`linksCommand` derived its whole verdict from `brokenLinks > 0`, and `findMarkdownFiles` swallows ENOENT and returns `[]`. Run outside the nexus-agents source repo, the hard-coded relative `baseDir: 'docs'` resolved to nothing, the summary came back all zeros, and the command exited `0` with `Link validation: 0 links validated, all OK` — a clean audit over a scan that opened no files. Verified by running the command from a directory with no `docs/` tree.

The command now fails with the wrong-CWD hint that `freshnessCommand` has carried since #2720. The guard keys on files read, not links found, so a docs tree of prose with no links at all is still a clean pass.
