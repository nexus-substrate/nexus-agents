---
'nexus-agents': major
---

Retire automatic Bluesky release announcements. `release-announce` now defaults to the blog channel. Requesting `--channels bluesky`, including a mixed `--channels blog,bluesky` request, exits with a clear retired-channel error before any announcement is generated. Blog generation and `--channels blog --dry-run` remain available.

For Bluesky announcements, compose a post manually using the release URL and highlights. The optional AT Protocol SDK dependency and the CLI exports `getBlueskyConfig`, `createBlueskyPost`, `BlueskyConfig`, and `BlueskyPostResult` are removed. Existing code using those exports must supply its own posting integration.

`AnnouncementChannel` is narrowed from `'blog' | 'bluesky'` to `'blog'`, including channel fields in announcement options and results. The exported `BLUESKY_LIMITS` constant is removed. Update typed callers to request only `blog` and remove imports of the retired client exports and constant. Spaced or case-varied Bluesky tokens also fail the entire request before blog output, including dry runs. Generate a blog preview and use its release URL and highlights for a manual Bluesky post.
