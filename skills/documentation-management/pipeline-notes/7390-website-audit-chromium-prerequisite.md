PIPELINE NOTE: Website Audit installs Chromium and its system dependencies before running the website test suite (#7390).

In `.github/workflows/docs-check.yml`, run `pnpm --dir website exec playwright install --with-deps chromium` after the frozen website dependency install and before `pnpm --dir website test`. The suite includes real browser accessibility tests, so a fresh runner needs the Chromium revision selected by the website lockfile. Website Audit retains its advisory status, and the dependency audit still runs when tests fail.
