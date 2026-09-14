---
'nexus-agents': patch
---

A gemini voter seat now reads the repository it was asked to judge, and every seat is told where that repository is.

The `gemini` arm spawns `agy`, whose workspace is the project it has stored — not the directory it is started in. The claude and codex arms take the working directory as their tree by default, so on a CLI-run governor panel (`nexus-agents vote --ratifies-pr …`) those seats read the PR head while a gemini seat searched a different checkout and abstained with `UNVERIFIABLE: could not read the artifact … no repository or accessible sandbox was provided`. Under `absolute_quorum` one such seat voids the ratification and costs a full re-run. Measured: spawned from this repository with the adapter's exact arguments, `agy` read `packages/nexus-agents/package.json` out of an unrelated checkout on the same machine and reported that file's version; with the working directory added it read this tree.

The adapter now passes `--add-dir <cwd>` on every `agy` invocation (a task's `workDir` option, the one the claude adapter honours, replaces the cwd). The vote prompt gains a `REPOSITORY ACCESS` block naming the working directory the panel runs in, stating that every seat's file and shell tools run there and that reading it is expected, and that the proposal text describes the artifact and is not a substitute for it. A seat whose tools genuinely cannot read that directory is still told to answer `UNVERIFIABLE`; the protocol is unchanged. The block is rendered only when a working directory is supplied — `collectRealVotes` always supplies the process cwd — so a direct `executeAgentVote` with no workspace produces the same prompt as before.
