/**
 * Sync .claude-plugin/plugin.json version with packages/nexus-agents/package.json.
 *
 * Run as part of changeset:version to prevent governance drift CI failures
 * from version mismatches. Idempotent — safe to run repeatedly.
 *
 * @module scripts/sync-plugin-version
 */

/* eslint-disable no-console -- build script; its stdout IS the interface (#4483) */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PKG_PATH = resolve(import.meta.dirname, '..', 'packages', 'nexus-agents', 'package.json');
const PLUGIN_PATH = resolve(import.meta.dirname, '..', '.claude-plugin', 'plugin.json');

function main(): void {
  const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8')) as { version: string };
  const plugin = JSON.parse(readFileSync(PLUGIN_PATH, 'utf-8')) as Record<string, unknown>;

  if (plugin['version'] === pkg.version) {
    console.log(`plugin.json already at ${pkg.version}`);
    process.exit(0);
  }

  plugin['version'] = pkg.version;
  writeFileSync(PLUGIN_PATH, JSON.stringify(plugin, null, 2) + '\n');
  console.log(`plugin.json updated to ${pkg.version}`);
}

if (process.argv[1]?.endsWith('sync-plugin-version.ts') === true) {
  main();
}
