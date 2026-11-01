PIPELINE NOTE: Website Audit bounds Chromium installation and test steps with explicit timeouts (#7641).

In `.github/workflows/docs-check.yml`, `Install Chromium` is bounded with `timeout-minutes: 4`, and `Install website dependencies`, `Test website plugins`, and `Audit website dependencies` carry `timeout-minutes: 3`. This ensures intermittent apt-get mirror or network stalls during Playwright system dependency setup fail the step explicitly instead of exhausting the 10-minute job budget, allowing the independent dependency audit step (`if: ${{ !cancelled() }}`) to execute and report.
