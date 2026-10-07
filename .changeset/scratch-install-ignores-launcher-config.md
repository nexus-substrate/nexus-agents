---
'nexus-agents': patch
---

Dev-pipeline scratch dependency installs no longer inherit the config a package-manager launcher exported. When the server or CLI runs under `pnpm run`, `npm run` or `npx`, the launcher flattens its resolved config into `npm_config_*` environment variables. Those variables reached the scratch `npm ci`, and npm 11 treats an env entry like a command-line flag. As a result, an `allow-scripts=…` line in `~/.npmrc`, which npm accepts in the file, failed every scratch install with `EALLOWSCRIPTS`. When launcher markers (`npm_lifecycle_event`, `npm_execpath`) are present, the install environment now drops the `npm_*`/`pnpm_*` variables, `PNPM_SCRIPT_SRC_DIR` and `NODE_PATH`. The installer re-reads `.npmrc` files itself. A `NPM_CONFIG_*` override exported in the shell is ignored in that case. Without a launcher, inherited npm config passes through unchanged, as before.
