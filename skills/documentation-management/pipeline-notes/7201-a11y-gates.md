PIPELINE NOTE: #7201 adds a blocking `accessibility` job after the built artifact
in `.github/workflows/deploy-website.yml`; deploy now needs it as well as the
link check. The website's pinned Playwright/axe dependencies run Chromium against
every built sitemap URL plus `404.html`, under `/nexus-agents`, in light and dark
themes. Serious/critical WCAG 2.0/2.1/2.2 A/AA violations, failed local resources,
incomplete coverage, and an empty sitemap fail the gate. The website tests also
check that every published user or missing-audience doc appears in the generated
nav; zero reader docs is unmeasured and fails.
The build explicitly sets `NODE_ENV=production`: Svelte development array-method
patches make axe prohibitively slow on large generated API pages. The runner uses
the pinned axe-core 4.14.0 source through Playwright's public `axeSource` option
for its large-page performance fixes, and records and verifies the actual engine
version. A regression test proves the added label/name mismatch rule runs in
both themes. The crawl logs each page/theme and fails incomplete scans after a
fifteen-minute page deadline.
The DocOps manifest now includes `deploy-website.yml`, so future changes to this
documentation deployment pipeline also require a pipeline note.
Task lists expose their status as text rather than disabled controls, and the
cloud-provider comparison tables now name their assessment column. The landing
and 404 contrast fixes use the stronger existing ink token, keep the terminal
on its dark background in both themes, and give Mermaid edge labels a contrasting
background. The labeled architecture diagram now has a figure role.

The same job runs `npx remarque-audit` with the installed remarque palette and
`--src src`. Its 72 palette contrast pairings pass, but 61 source-policy findings
include legacy landing-page type sizes and colors, Mermaid JavaScript color
strings, and the terminal contrast colors. This source-policy audit is advisory
pending the separate landing redesign; it does not evaluate rendered CSS cascade
contrast. Axe blocks rendered contrast regressions on all pages, including the
landing page and 404. The JSON reports retain rule/node counts and theme coverage.
Locally, run `pnpm --dir website test`, build the API collection before the
website, then `pnpm --dir website a11y --report /tmp/a11y-report.json`.
