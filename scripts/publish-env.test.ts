import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { publishEnv } from './publish-env.js';
import { ROOT } from './script-paths.js';

describe('publishEnv', () => {
  it('removes pnpm-only npm config while preserving npm auth and provenance', () => {
    const original = {
      npm_config_node_linker: 'isolated',
      npm_config_verify_deps_before_run: 'false',
      NPM_CONFIG_NODE_LINKER: 'isolated',
      NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: 'false',
      NPM_CONFIG_PROVENANCE: 'true',
      CHANGESETS_OUTPUT: '/output.jsonl',
    };
    const env = publishEnv(original);
    expect(env).not.toHaveProperty('npm_config_node_linker');
    expect(env).not.toHaveProperty('npm_config_verify_deps_before_run');
    expect(env).not.toHaveProperty('NPM_CONFIG_NODE_LINKER');
    expect(env).not.toHaveProperty('NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN');
    expect(env['NPM_CONFIG_PROVENANCE']).toBe('true');
    expect(env['CHANGESETS_OUTPUT']).toBe('/output.jsonl');
    expect(env['pnpm_config_verify_deps_before_run']).toBe('false');
    expect(original.npm_config_node_linker).toBe('isolated');
  });

  it('preserves pnpm verification precedence', () => {
    expect(
      publishEnv({
        npm_config_verify_deps_before_run: 'false',
        pnpm_config_verify_deps_before_run: 'warn',
      })['pnpm_config_verify_deps_before_run']
    ).toBe('warn');
  });

  it('keeps the workspace isolated by default and hoisted through nested pnpm', () => {
    const base = { ...process.env };
    delete base['NEXUS_PUBLISH_NODE_LINKER'];
    delete base['npm_config_node_linker'];
    delete base['NPM_CONFIG_NODE_LINKER'];
    const getLinker = (args: string[], env: NodeJS.ProcessEnv): string =>
      execFileSync('pnpm', args, { cwd: ROOT, env, encoding: 'utf8' }).trim();
    expect(getLinker(['config', 'get', 'node-linker'], base)).toBe('isolated');
    expect(
      getLinker(
        ['--config.node-linker=hoisted', 'exec', 'pnpm', 'config', 'get', 'node-linker'],
        publishEnv(base)
      )
    ).toBe('hoisted');
  });
});
