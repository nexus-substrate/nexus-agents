---
'nexus-agents': patch
---

Pin `js-yaml` resolution to v4.2.x without disturbing v3 consumers (#4124). A grouped
production-dep bump (#4120, via an `astro` update) resolved the tree to js-yaml v5, which
dropped the CJS `default` export and broke the astro website build through
`@astrojs/internal-helpers`. Two surgical pnpm-override ranges fix it: the existing CVE
floor (`>=4.0.0 <4.2.0` → `>=4.2.0`) plus a v5 cap (`>=5.0.0` → `4.2.0`). Critically these
leave `read-yaml-file`'s js-yaml v3 untouched (a blanket `^4.2.0` would have forced it to
v4, removing `yaml.safeLoad` and breaking `@changesets/cli`). Verified: read-yaml-file
keeps js-yaml 3.15.0, others 4.2.0, no v5; website builds and `changeset version` parses.
