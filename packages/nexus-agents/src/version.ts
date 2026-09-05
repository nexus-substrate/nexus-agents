/**
 * nexus-agents - Version constant
 *
 * Injected at build time via tsup define from package.json.
 * Do NOT edit VERSION manually — it is replaced during build.
 */

import semver from 'semver';

declare const __NEXUS_VERSION__: string;

export const VERSION: string = typeof __NEXUS_VERSION__ !== 'undefined' ? __NEXUS_VERSION__ : 'dev';

/** Supported Node.js versions. Pinned to package.json by a regression test. */
export const NODE_ENGINE_RANGE = '>=22.5.0';

/** Returns whether a Node.js version satisfies the package engine requirement. */
export function isNodeVersionSupported(version: string): boolean {
  return semver.satisfies(version, NODE_ENGINE_RANGE);
}
