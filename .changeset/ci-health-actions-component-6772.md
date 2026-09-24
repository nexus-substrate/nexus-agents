---
'nexus-agents': patch
---

`ci_health_check` reads the GitHub status page again. It looked for a component named `GitHub Actions`, but the githubstatus.com feed now names it `Actions`, so the status-page signal was always `unknown` and an Actions outage never reached the verdict. The component is now matched by its stable id (`br0l2tvcx85d`), then by the exact name `Actions` or `GitHub Actions`; a component whose name only contains "Actions" is not matched. When the feed has no matching component, the signal stays `unknown` and its evidence says "Actions component not found in status feed" and lists the components the feed did contain. A feed without a `components` array, and a matched component without a status, are each reported as such.
