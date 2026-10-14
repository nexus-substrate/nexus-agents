PIPELINE NOTE: Coordinate the Pages deployment deadlines in `.github/workflows/deploy-website.yml` (#7414).

The deploy job allows 15 minutes and explicitly sets the Pages action timeout to 600,000 milliseconds. The pinned action caps its own wait at 10 minutes; the enclosing job leaves time for setup and cancellation. Existing build, link and accessibility dependencies, deployment permissions and terminal failure handling remain in place.

`scripts/deploy-website.test.ts` parses the actual workflow and checks the effective action budget, job headroom and explicit numeric timeout. Verify Pages deployment status and live content separately from a failed runner result before deciding whether recovery needs another deployment.
