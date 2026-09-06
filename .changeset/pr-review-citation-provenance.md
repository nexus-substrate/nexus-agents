---
'nexus-agents': minor
---

Record base-ref provenance on PR-review citations. `postReviewToGitHub` cited
the PR's own changed-file list, including files the PR ADDS, so the
corroboration record attributed repo provenance to paths the author invented in
the same change — the mislabel class #4667 fixed for issue bodies, on the PR
path. `RepoFileSource` gains an optional `existsOnBaseRef`, and
`CorroborationResult` gains `clearedOnlyByUnverifiedSources` so the record can
say the floor was cleared entirely by author-supplied paths.

Chosen by a 7-voter panel (option D, 5/6 approvers, supermajority met): the
corroboration floor itself is deliberately unchanged, because dropping
added-file citations would leave an add-only PR with zero sources and refuse a
legitimate review. #5796 tracks tightening the bar.
