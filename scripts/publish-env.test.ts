import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  it('drops unknown pnpm settings and future keys in either case', () => {
    const unknown = {
      npm_config_strict_dep_builds: 'true',
      NPM_CONFIG_NPM_GLOBALCONFIG: '/pnpm/npmrc',
      npm_config__jsr_registry: 'https://npm.jsr.io',
      npm_config_future_pnpm_setting: 'true',
      'npm_config_//registry.example/:future-setting': 'true',
    };
    const env = publishEnv(unknown);
    for (const key of Object.keys(unknown)) expect(env).not.toHaveProperty(key);
    expect(unknown.npm_config_strict_dep_builds).toBe('true');
  });

  it('keeps npm config, scoped authentication, and OIDC credentials', () => {
    const required = {
      NPM_CONFIG_PROVENANCE: 'true',
      NODE_AUTH_TOKEN: 'TEST_FAKE_TOKEN',
      npm_config_registry: 'https://registry.example/',
      npm_config_userconfig: '/custom/npmrc',
      npm_config_cache: '/custom/cache',
      npm_config_ignore_scripts: 'true',
      npm_config__auth: 'TEST_FAKE_AUTH',
      'NPM_CONFIG_//registry.example/:_authToken': 'TEST_FAKE_TOKEN',
      'npm_config_//registry.example/:_password': 'TEST_FAKE_PASSWORD',
      'npm_config_//registry.example/:username': 'TEST_FAKE_USER',
      'npm_config_//registry.example/:certfile': '/custom/cert',
      'npm_config_@example:registry': 'https://registry.example/',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'TEST_FAKE_OIDC_TOKEN',
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'example/repo',
    };
    expect(publishEnv(required)).toMatchObject(required);
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

describe('publish-env command', () => {
  it('cleans config after pnpm exec while keeping auth and provenance', () => {
    const stdout = execFileSync(
      'pnpm',
      [
        'exec',
        'tsx',
        'scripts/publish-env.ts',
        process.execPath,
        '-e',
        'console.log(JSON.stringify({ keys: Object.keys(process.env), ' +
          'provenance: process.env.NPM_CONFIG_PROVENANCE, ' +
          'auth: process.env.NODE_AUTH_TOKEN, registry: process.env.npm_config_registry }))',
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_config_strict_dep_builds: 'true',
          npm_config_npm_globalconfig: '/pnpm/npmrc',
          npm_config__jsr_registry: 'https://npm.jsr.io',
          NPM_CONFIG_PROVENANCE: 'true',
          NODE_AUTH_TOKEN: 'TEST_FAKE_TOKEN',
          npm_config_registry: 'https://registry.example/',
        },
      }
    );
    const child = JSON.parse(stdout) as {
      keys: string[];
      provenance: string;
      auth: string;
      registry: string;
    };
    expect(
      child.keys.filter((key) =>
        /^npm_config_(strict_dep_builds|npm_globalconfig|_jsr_registry|verify_deps_before_run)/i.test(
          key
        )
      )
    ).toEqual([]);
    expect(child).toMatchObject({
      provenance: 'true',
      auth: 'TEST_FAKE_TOKEN',
      registry: 'https://registry.example/',
    });
  });

  it('preserves a failing child exit code', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(ROOT, 'scripts/publish-env.ts'),
        process.execPath,
        '-e',
        'process.exit(7)',
      ],
      { cwd: ROOT }
    );
    expect(child.status).toBe(7);
  });

  it('re-raises a child killed by a signal instead of reporting exit 1', () => {
    // release-publish.ts reports "killed by a signal" only when the exit code is null.
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(ROOT, 'scripts/publish-env.ts'),
        process.execPath,
        '-e',
        'process.kill(process.pid, "SIGTERM")',
      ],
      { cwd: ROOT }
    );
    expect(child.status).toBeNull();
    expect(child.signal).toBe('SIGTERM');
  });
});

function probeDiscovery(
  output: string,
  program: string
): {
  child: ReturnType<typeof spawnSync>;
  records: Array<{ args: string[]; cwd: string; keys: string[] }>;
} {
  const dir = mkdtempSync(join(tmpdir(), 'publish-env-discovery-'));
  try {
    const record = join(dir, 'record.jsonl');
    const npm = join(dir, 'npm');
    writeFileSync(
      npm,
      `#!${process.execPath}\n` +
        'const fs = require("node:fs");\n' +
        'fs.appendFileSync(process.env.FAKE_NPM_RECORD, JSON.stringify({' +
        'args: process.argv.slice(2), cwd: process.cwd(), keys: Object.keys(process.env)' +
        '}) + "\\n");\n' +
        'process.stdout.write(process.env.FAKE_NPM_CONFIG_OUTPUT);\n'
    );
    chmodSync(npm, 0o755);
    const child = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { publishEnv } from ${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/publish-env.ts')).href)}; ${program}`,
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH ?? ''}`,
          FAKE_NPM_RECORD: record,
          FAKE_NPM_CONFIG_OUTPUT: output,
          NPM_CONFIG_USERCONFIG: '/untrusted/npmrc',
          npm_config_future_pnpm_setting: 'true',
        },
      }
    );
    const records = readFileSync(record, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { args: string[]; cwd: string; keys: string[] });
    return { child, records };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('npm config discovery', () => {
  it('isolates npm config files and env, and caches discovery once', () => {
    const { child, records } = probeDiscovery(
      JSON.stringify({
        registry: '',
        cache: '',
        userconfig: '',
        provenance: false,
        'fetch-retries': 2,
      }),
      'const source = { ...process.env, npm_config_fetch_retries: "5" }; ' +
        'for (let i = 0; i < 2; i++) { ' +
        'const env = publishEnv(source); ' +
        'if (env.npm_config_fetch_retries !== "5" || "npm_config_future_pnpm_setting" in env) process.exit(9); }'
    );
    expect(child.status).toBe(0);
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record).toBeDefined();
    expect(record?.keys.filter((key) => /^npm_config_/i.test(key))).toEqual([]);
    expect(record?.cwd).not.toBe(ROOT);
    expect(record?.args).toEqual([
      'config',
      'ls',
      '-l',
      '--json',
      `--userconfig=${join(record?.cwd ?? '', 'user.npmrc')}`,
      `--globalconfig=${join(record?.cwd ?? '', 'global.npmrc')}`,
    ]);
  });

  it.each(['{}', '[]', 'null', 'invalid json'])(
    'refuses invalid or empty npm defaults: %s',
    (output) => {
      const { child } = probeDiscovery(output, 'publishEnv(process.env)');
      expect(child.status).not.toBe(0);
      expect(child.stderr?.toString()).toContain('Cannot discover npm config keys');
    }
  );
});
