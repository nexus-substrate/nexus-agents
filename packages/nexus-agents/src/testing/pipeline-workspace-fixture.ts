/**
 * Isolate a dev-pipeline workspace fixture from how vitest was launched (#7137).
 *
 * `pnpm test` and `npx vitest` export the launcher's resolved config as
 * npm_config_* plus its run context (npm_lifecycle_event, npm_execpath, ...),
 * and a real npm reads the caller's ~/.npmrc. A fixture that inherits either
 * passes or fails depending on the invocation. Tests that exercise the launcher
 * case stub those variables explicitly after calling this.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

const PACKAGE_MANAGER_ENV = /^(?:npm_|pnpm_|PNPM_SCRIPT_SRC_DIR$|NODE_PATH$)/i;

export function isolatePackageManagerEnv(root: string): void {
  for (const name of Object.keys(process.env)) {
    if (PACKAGE_MANAGER_ENV.test(name)) vi.stubEnv(name, undefined);
  }
  const home = join(root, 'home');
  mkdirSync(home, { recursive: true });
  vi.stubEnv('HOME', home);
}
