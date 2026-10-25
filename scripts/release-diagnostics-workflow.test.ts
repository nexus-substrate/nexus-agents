import { spawnSync } from 'node:child_process';
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
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { ROOT } from './script-paths.js';

const require = createRequire(import.meta.url);
const directories: string[] = [];
const workflow = z
  .object({
    jobs: z.object({
      release: z.object({
        steps: z.array(
          z.object({
            run: z.string().optional(),
            with: z.record(z.string(), z.unknown()).optional(),
          })
        ),
      }),
    }),
  })
  .parse(parse(readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8')));
const releaseScript = z
  .object({ scripts: z.object({ release: z.string() }) })
  .parse(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))).scripts.release;

/** Installed CLI only; never let Corepack download in the credential-free fixture. */
function installedPnpm(): string {
  const cache =
    process.env['COREPACK_HOME'] ??
    join(process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'node/corepack');
  const cached = join(cache, 'v1/pnpm/10.34.5/bin/pnpm.cjs');
  if (existsSync(cached)) return realpathSync(cached);
  for (const entry of (process.env['PATH'] ?? '').split(delimiter)) {
    const candidate = join(entry, 'pnpm');
    if (existsSync(candidate) && !realpathSync(candidate).includes('/corepack/'))
      return realpathSync(candidate);
  }
  throw new Error('Installed pnpm unavailable without downloading');
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

it.each(['changesets', 'fallback'] as const)(
  '%s enables only the canonical publish wrapper',
  (route) => {
    const steps = workflow.jobs.release.steps;
    const command =
      route === 'changesets'
        ? steps
            .map((step) => step.with?.['publish-script'])
            .find((value): value is string => typeof value === 'string')
        : steps
            .flatMap((step) => step.run?.split('\n') ?? [])
            .find((line) =>
              /^\s*pnpm exec tsx scripts\/publish-env\.ts pnpm release(?:\s|$)/.test(line)
            )
            ?.trim();
    if (command === undefined) throw new Error(`Missing ${route} canonical publish command`);
    const directory = mkdtempSync(join(tmpdir(), 'release-workflow-diagnostics-'));
    directories.push(directory);
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    mkdirSync(join(directory, 'packages', 'test-fake-package'), { recursive: true });
    writeFileSync(
      join(directory, 'packages', 'test-fake-package', 'package.json'),
      JSON.stringify({ name: 'test-fake-package', version: '1.0.0' })
    );
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        name: 'test-fake-release-pipeline',
        private: true,
        scripts: { release: releaseScript },
      })
    );
    for (const name of ['user.npmrc', 'global.npmrc']) writeFileSync(join(directory, name), '');
    const record = join(directory, 'calls.jsonl');
    const dispatcher = `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify(args) + '\\n');
const exec = (file, argv) => { const p = cp.spawnSync(file, argv, {stdio:'inherit', env:process.env}); if(p.error) throw p.error; process.exit(p.status ?? 1); };
if (args[0] === 'release') exec(${JSON.stringify(installedPnpm())}, args);
if (args.length === 1 && args[0] === 'build') process.exit(0);
if (args[0] === 'exec' && args[1] === 'tsx') {
  if (args[2] === 'scripts/stage-publish.ts') process.exit(0);
  if (['scripts/release-publish.ts', 'scripts/publish-env.ts'].includes(args[2]))
    exec(${JSON.stringify(process.execPath)}, ['--import', ${JSON.stringify(require.resolve('tsx'))}, path.join(${JSON.stringify(ROOT)}, args[2]), ...args.slice(3)]);
}
if (JSON.stringify(args.slice(0,6)) === JSON.stringify(['--config.node-linker=hoisted','exec','tsx','scripts/publish-env.ts','changeset','publish'])) process.exit(0);
throw new Error('Unexpected synthetic pipeline command: ' + JSON.stringify(args));
`;
    writeFileSync(join(bin, 'pnpm'), dispatcher);
    chmodSync(join(bin, 'pnpm'), 0o755);
    writeFileSync(
      join(bin, 'npm'),
      `#!${process.execPath}\nif(JSON.stringify(process.argv.slice(2,6))!==JSON.stringify(['config','ls','-l','--json']))throw Error('Only config discovery allowed'); console.log(JSON.stringify({registry:'https://example.test',userconfig:'',cache:'',provenance:false}));\n`
    );
    chmodSync(join(bin, 'npm'), 0o755);
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        HOME: directory,
        PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
        NEXUS_SCRIPT_ROOT: directory,
        COREPACK_ENABLE_NETWORK: '0',
        NPM_CONFIG_USERCONFIG: join(directory, 'user.npmrc'),
        NPM_CONFIG_GLOBALCONFIG: join(directory, 'global.npmrc'),
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const calls = z.array(z.array(z.string())).parse(
      readFileSync(record, 'utf8')
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line))
    );
    expect(calls).toContainEqual(['build']);
    expect(calls).toContainEqual(['exec', 'tsx', 'scripts/stage-publish.ts']);
    expect(calls).toContainEqual(['exec', 'tsx', 'scripts/release-publish.ts', '--diagnostics']);
    const publisher = calls.filter((args) => args.includes('changeset'));
    expect(publisher).toHaveLength(1);
    expect(publisher[0]).not.toContain('--diagnostics');
    expect(result.stderr).toContain('publish-diagnostics: ');
  }
);
