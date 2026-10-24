import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, it } from 'vitest';

import { collectPublishDiagnostics } from './publish-diagnostics.js';
import { ROOT } from './script-paths.js';

/** SYNTHETIC npm only: real installed Changesets and pnpm, no registry/auth operation. */
const SYNTHETIC_PUBLISHER = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== 'publish') throw new Error('TEST_FAKE publisher only accepts publish');
const target = args.find(arg => arg.endsWith('.tgz'));
if (!target) throw new Error('TEST_FAKE publisher requires pnpm-packed tar basename');
const record = {
  args, target, cwd: process.cwd(),
  logsDir: process.env.npm_config_logs_dir,
  logsMax: process.env.npm_config_logs_max,
  offline: process.env.npm_config_offline,
  corepackNetwork: process.env.COREPACK_ENABLE_NETWORK,
  forbiddenEnvPresent: Object.keys(process.env).some(key => /^(CI$|GITHUB_|ACTIONS_|AWS_|OPENAI_|ANTHROPIC_|GOOGLE_|GEMINI_|NODE_AUTH_TOKEN$|NPM_TOKEN$|NPM_ID_TOKEN$)|(?:auth|token|password|secret)/i.test(key))
};
fs.writeFileSync(${JSON.stringify('TEST_FAKE_RECORD_PLACEHOLDER')}, JSON.stringify(record));
if (!record.logsDir) process.exit(0);
const stamp = new Date().toISOString().replace(/[.:]/g, '_');
const lines = [
  '0 verbose cli /usr/bin/node /usr/lib/node_modules/npm/bin/npm-cli.js',
  '1 info using npm@11.21.0',
  '2 info using node@v24.22.0',
  '3 verbose title npm publish ' + target,
  '4 verbose argv ' + args.map(arg => JSON.stringify(arg)).join(' '),
  '5 silly oidc Skipped because no id_token available',
  '6 verbose exit 0',
  '7 info ok'
];
fs.writeFileSync(path.join(record.logsDir, stamp + '-debug-0.log'), lines.join('\\n') + '\\n');
console.log('{}');
`;

function prepareFixture(directory: string): { pkgDir: string; logsDir: string; record: string } {
  const pkgDir = join(directory, 'pkg');
  const stage = join(pkgDir, '.publish-stage');
  const logsDir = join(directory, 'logs');
  const record = join(directory, 'publisher.json');
  mkdirSync(stage, { recursive: true });
  mkdirSync(logsDir);
  mkdirSync(join(directory, 'home'));
  for (const file of ['user.npmrc', 'global.npmrc']) writeFileSync(join(directory, file), '');
  const manifest = { name: 'test-fake-diagnostic-package', version: '1.2.3' };
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ ...manifest, publishConfig: { directory: '.publish-stage' } })
  );
  writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest));
  writeFileSync(
    join(stage, 'index.js'),
    '// TEST_FAKE synthetic package, no dependencies or lifecycle\n'
  );
  const publisher = join(directory, 'synthetic-npm.cjs');
  writeFileSync(
    publisher,
    SYNTHETIC_PUBLISHER.replace(
      JSON.stringify('TEST_FAKE_RECORD_PLACEHOLDER'),
      JSON.stringify(record)
    )
  );
  chmodSync(publisher, 0o755);
  writeFileSync(join(pkgDir, '.npmrc'), `npm-path=${publisher}\noffline=true\nfetch-retries=0\n`);
  return { pkgDir, logsDir, record };
}

/** Resolve installed code only: never ask Corepack to download into the isolated HOME. */
function installedPnpm(): string {
  const cache =
    process.env['COREPACK_HOME'] ??
    join(process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'node/corepack');
  const cached = join(cache, 'v1/pnpm/10.34.5/bin/pnpm.cjs');
  if (existsSync(cached)) return realpathSync(cached);
  for (const entry of (process.env['PATH'] ?? '').split(':')) {
    const candidate = join(entry, 'pnpm');
    if (!existsSync(candidate)) continue;
    const resolved = realpathSync(candidate);
    if (!resolved.includes('/corepack/')) return resolved;
  }
  throw new Error('Installed pnpm CLI unavailable without Corepack network resolution');
}

/** Synthetic parent candidate A is deliberately a helper, never evidence for publisher B. */
function writeParentCandidate(logsDir: string, startedAtMs: number): void {
  const stamp = new Date(startedAtMs).toISOString().replace(/[.:]/g, '_');
  writeFileSync(
    join(logsDir, `${stamp}-debug-0.log`),
    [
      '0 verbose cli /usr/local/bin/node /usr/local/bin/npm',
      '1 info using npm@11.19.1',
      '2 info using node@v24.22.0',
      '3 verbose title npm config ls',
      '4 verbose argv "config" "ls"',
      '5 verbose exit 0',
      '6 info ok',
      '',
    ].join('\n')
  );
}

function runInstalledPublish(directory: string, pkgDir: string, logsDir: string): string {
  const changesets = JSON.parse(
    readFileSync(join(ROOT, 'node_modules/@changesets/cli/package.json'), 'utf8')
  ) as { version: string };
  expect(changesets.version).toBe('3.0.3');
  const pnpm = installedPnpm();
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  const shim = join(bin, 'pnpm');
  writeFileSync(
    shim,
    `#!${process.execPath}\nconst { spawnSync } = require('node:child_process');\nconst child = spawnSync(${JSON.stringify(process.execPath)}, [${JSON.stringify(pnpm)}, ...process.argv.slice(2)], { env: process.env, stdio: 'inherit' });\nif (child.error) throw child.error;\nprocess.exitCode = child.status ?? 1;\n`
  );
  chmodSync(shim, 0o755);
  const env = {
    HOME: join(directory, 'home'),
    PATH: `${bin}:${dirname(process.execPath)}:${process.env['PATH'] ?? ''}`,
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    npm_config_userconfig: join(directory, 'user.npmrc'),
    npm_config_globalconfig: join(directory, 'global.npmrc'),
    npm_config_cache: join(directory, 'cache'),
    npm_config_offline: 'true',
    npm_config_fetch_retries: '0',
    npm_config_logs_dir: logsDir,
    npm_config_logs_max: '1000',
  };
  const program = `
    import { publishEnv } from ${JSON.stringify(join(ROOT, 'scripts/publish-env.ts'))};
    const { r: getPublishTool } = await import(${JSON.stringify(join(ROOT, 'node_modules/@changesets/cli/dist/getPublishPlan.mjs'))});
    const source = process.env;
    Object.assign(process.env, publishEnv(source));
    const tool = await getPublishTool({ rootDir: ${JSON.stringify(directory)}, tool: { type: 'pnpm' } });
    const result = await tool.publish({
      pkg: { dir: ${JSON.stringify(pkgDir)}, packageJson: { name: 'test-fake-diagnostic-package', version: '1.2.3', publishConfig: { directory: '.publish-stage' } } },
      release: { name: 'test-fake-diagnostic-package', version: '1.2.3', access: 'public', tag: 'next' },
      tarballPath: null, interactive: false
    });
    if (result.result !== 'published') throw new Error(JSON.stringify(result));
  `;
  expect(
    execFileSync('pnpm', ['--version'], {
      env,
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
    }).trim()
  ).toBe('10.34.5');
  return execFileSync(
    process.execPath,
    [
      '--import',
      join(ROOT, 'node_modules/tsx/dist/loader.mjs'),
      '--input-type=module',
      '-e',
      program,
    ],
    {
      env,
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

it('propagates owned logs through publishEnv, installed Changesets and real pnpm to SYNTHETIC npm child B', () => {
  const directory = mkdtempSync(join(tmpdir(), 'publish-diagnostics-composition-'));
  try {
    const { pkgDir, logsDir, record } = prepareFixture(directory);
    const startedAtMs = Date.now();
    writeParentCandidate(logsDir, startedAtMs);
    const stdout = runInstalledPublish(directory, pkgDir, logsDir);
    const endedAtMs = Date.now();
    const child = JSON.parse(readFileSync(record, 'utf8')) as Record<string, unknown>;
    expect(child).toMatchObject({
      logsDir,
      logsMax: '1000',
      offline: 'true',
      corepackNetwork: '0',
      forbiddenEnvPresent: false,
    });
    expect(child['args']).toEqual(
      expect.arrayContaining([
        'publish',
        '--ignore-scripts',
        'test-fake-diagnostic-package-1.2.3.tgz',
        '--tag',
        'next',
      ])
    );
    expect(child['cwd']).not.toBe(pkgDir);
    expect(stdout).not.toContain('TEST_FAKE');
    const diagnostics = collectPublishDiagnostics(
      logsDir,
      new Map([['test-fake-diagnostic-package', '1.2.3']]),
      {
        id: 'offline-synthetic-composition',
        startedAtMs,
        endedAtMs,
      }
    );
    expect(diagnostics.measurement).toBe('observed');
    expect(diagnostics.attempts).toHaveLength(1);
    expect(diagnostics.attempts[0]).toMatchObject({
      provenance: 'npm-debug-self-report',
      identity: { npmVersion: '11.21.0', npmPath: '/usr/lib/node_modules/npm/bin/npm-cli.js' },
      packageName: 'test-fake-diagnostic-package',
      packageVersion: '1.2.3',
      packageEvidence: 'publish-target-basename',
      oidc: ['no-id-token-skipped'],
    });
    expect(diagnostics.attempts[0]?.identity?.npmVersion).not.toBe('11.19.1');
    expect(diagnostics.attempts[0]?.identity?.npmPath).not.toBe('/usr/local/bin/npm');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
