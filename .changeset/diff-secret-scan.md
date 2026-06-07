---
'nexus-agents': patch
---

feat(capability-loop): pre-push secret scan for auto-remediation diffs (#3669)

Closes THE gap the #3618/#3648 votes flagged: `gh pr create` publishes the branch,
so a secret in a remediation diff leaks the instant it's pushed — before any
merge-time guard fires, irreversibly in git history. `scanForSecrets` is an
in-tree, dependency-free, fail-closed regex scanner (private keys, AWS/GitHub/
Slack/Google/OpenAI/Anthropic keys, JWTs, generic credential assignments). The
Option B/A implement adapters run it BEFORE push and abort on any finding;
findings report pattern + line only, never the secret value.
