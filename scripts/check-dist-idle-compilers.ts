/**
 * Verify the BUILT MCP server does not load a TypeScript compiler at idle (#6405).
 *
 * The idle-footprint profile on #5231 attributed −120 MB RSS / −43 MB heap to
 * two compiler copies nothing uses until a tool call needs them: `typescript`
 * (standalone) and `ts-morph` + `@ts-morph/common` (a second bundled copy).
 * Dynamic imports existed in `src/` before this gate, but tsup hoists the
 * importing modules into chunks that `dist/cli.js` imports statically, so the
 * intent was defeated in the published artifact and nothing measured it.
 *
 * This is why the check runs the ARTIFACT, not the source: it starts
 * `dist/cli.js --mode=server` with stdin held open, preloads a census hook,
 * waits for the server's own "MCP server started successfully" line, then asks
 * it to shut down and reads back every loaded module specifier — from the CJS
 * cache and from an ESM loader hook, since the compilers are CommonJS reached
 * through both loaders. Any specifier under `node_modules/{typescript,
 * ts-morph,@ts-morph}/` fails the gate.
 *
 * The empty case is named: a server that never printed its started line has
 * not been measured, and "unmeasured" is a failure here, not a pass.
 *
 * @module scripts/check-dist-idle-compilers
 * (Source: Issue #6405, profile on #5231)
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ROOT } from './script-paths.js';

const DIST_CLI = join(ROOT, 'packages/nexus-agents/dist/cli.js');

/** The line `cli-server.ts` logs once the stdio transport is connected. */
export const SERVER_STARTED_LINE = 'MCP server started successfully';

/**
 * Compiler packages that must not be resident at idle. Matched as a
 * `node_modules/<name>/` path segment so an own-dist chunk whose file name
 * happens to contain "typescript" cannot trip it, while the pnpm layout
 * (`node_modules/.pnpm/typescript@x/node_modules/typescript/…`) still does.
 */
export const COMPILER_MODULE_PATTERN = /[\\/]node_modules[\\/](typescript|ts-morph|@ts-morph)[\\/]/;

/** What one idle run observed. */
export interface IdleCompilerCensus {
  /** Whether the server printed {@link SERVER_STARTED_LINE} before shutdown. */
  readonly started: boolean;
  /** Every module specifier the child loaded (CJS cache keys + ESM hook URLs). */
  readonly loaded: readonly string[];
  /** The child's stderr, for diagnosis when `started` is false. */
  readonly stderr: string;
}

/** Sorted, de-duplicated compiler specifiers from a loaded-module list. */
export function compilerModulesIn(loaded: readonly string[]): string[] {
  return [...new Set(loaded.filter((spec) => COMPILER_MODULE_PATTERN.test(spec)))].sort();
}

/**
 * Turn a census into a verdict. An unstarted server is reported as
 * unmeasured — it cannot vouch for what a running server would hold.
 */
export function judgeCensus(census: IdleCompilerCensus): { ok: boolean; problems: string[] } {
  if (!census.started) {
    return {
      ok: false,
      problems: [
        `server never printed "${SERVER_STARTED_LINE}" — idle module set was NOT measured`,
      ],
    };
  }
  const resident = compilerModulesIn(census.loaded);
  return { ok: resident.length === 0, problems: resident };
}

/**
 * Preload for the child (`--import`): registers an ESM loader hook that
 * appends every loaded URL to `<out>.esm`, and on SIGTERM writes the CJS
 * cache keys to `<out>` before exiting. Plain JS because the child is bare
 * `node`.
 *
 * The preload owns SIGTERM rather than relying on the server's handler:
 * `cli-server.ts` installs its own only AFTER it logs the started line, so a
 * signal sent on that line can land in the window where Node's default
 * disposition kills the process with no `exit` event — and no census.
 */
const PRELOAD_SOURCE = `
import { writeFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
const out = process.env.IDLE_COMPILER_CENSUS_OUT;
register(new URL('./census-hook.mjs', import.meta.url), { data: { out: out + '.esm' } });
const requireFromHere = createRequire(import.meta.url);
process.on('SIGTERM', () => {
  writeFileSync(out, JSON.stringify(Object.keys(requireFromHere.cache)));
  process.exit(0);
});
`;

const HOOK_SOURCE = `
import { appendFileSync } from 'node:fs';
let out;
export async function initialize(data) { out = data.out; }
export async function load(url, context, next) {
  appendFileSync(out, url + '\\n');
  return next(url, context);
}
`;

function readLoaded(outFile: string): string[] {
  const cjs = existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf-8')) as string[]) : [];
  const esm = existsSync(`${outFile}.esm`)
    ? readFileSync(`${outFile}.esm`, 'utf-8').split('\n').filter(Boolean)
    : [];
  return [...cjs, ...esm];
}

/** Resolve true once `stderr` carries the started line; false on exit or timeout. */
function waitForStarted(
  child: ChildProcess,
  onStderr: (chunk: string) => void,
  timeoutMs: number
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let seen = '';
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      onStderr(text);
      seen += text;
      if (seen.includes(SERVER_STARTED_LINE)) {
        clearTimeout(timer);
        resolve(true);
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** SIGTERM the child (the preload answers it) and wait, escalating to SIGKILL. */
function terminate(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const killer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 10_000);
    child.on('exit', () => {
      clearTimeout(killer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

/**
 * Start the built server, wait for its started line, shut it down, and return
 * what it had loaded. `startTimeoutMs` bounds the wait for the started line;
 * a server that exits or stalls before then is reported as `started: false`.
 */
export async function censusIdleServer(
  cliPath: string,
  startTimeoutMs = 30_000
): Promise<IdleCompilerCensus> {
  const box = mkdtempSync(join(tmpdir(), 'idle-compilers-'));
  const preload = join(box, 'census-preload.mjs');
  const outFile = join(box, 'census.json');
  writeFileSync(preload, PRELOAD_SOURCE);
  writeFileSync(join(box, 'census-hook.mjs'), HOOK_SOURCE);

  const child = spawn(
    process.execPath,
    ['--import', pathToFileURL(preload).href, cliPath, '--mode=server'],
    {
      // stdin is a pipe we never close: the stdio transport exits on EOF, and
      // an idle server is one that is still waiting for its first request.
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        IDLE_COMPILER_CENSUS_OUT: outFile,
        NEXUS_DATA_DIR: join(box, 'data'),
      },
    }
  );

  let stderr = '';
  const started = await waitForStarted(
    child,
    (chunk) => {
      stderr += chunk;
    },
    startTimeoutMs
  );
  await terminate(child);

  try {
    return { started, loaded: readLoaded(outFile), stderr };
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (!existsSync(DIST_CLI)) {
    console.error(`::error::${DIST_CLI} not found — run the build first.`);
    process.exitCode = 1;
    return;
  }
  const census = await censusIdleServer(DIST_CLI);
  const verdict = judgeCensus(census);
  if (!verdict.ok) {
    console.error('::error::The built MCP server loads a TypeScript compiler at idle (#6405).');
    console.error('A static import somewhere on the server entry path reaches ts-morph or');
    console.error('typescript; load them through indexer/lazy-compiler.ts instead.');
    for (const p of verdict.problems) console.error(`  - ${p}`);
    if (!census.started) console.error(census.stderr.slice(-4000));
    process.exitCode = 1;
    return;
  }
  console.log(
    `dist idle compilers OK (${String(census.loaded.length)} modules loaded, none from typescript/ts-morph).`
  );
}

if (process.argv[1]?.endsWith('check-dist-idle-compilers.ts') === true) {
  await main();
}
