/** Owned actual-module entry fixture; no production entry helper (#7680). */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const loader = join(root, 'node_modules/tsx/dist/loader.mjs');
const requireFromLoader = createRequire(realpathSync(loader));
const esbuildMain = requireFromLoader.resolve('esbuild');
const esbuildRequire = createRequire(esbuildMain);
const binarySuffix = process.platform === 'win32' ? '/esbuild.exe' : '/bin/esbuild';
const esbuildBinary = realpathSync(
  esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}${binarySuffix}`)
);
const esbuildVersion = (esbuildRequire('esbuild/package.json') as { version: string }).version;
const loaderPolicy = [
  [
    'client-XItNFmsq.cjs',
    'cc72bed2d57324f12318efdc804772a2de18a3deb836ab1d63bdc493ad542113',
    1,
    431,
  ],
  [
    'require-CBjy4Foe.mjs',
    'b1156f2ecff29ef55801df8f4e1d9b34a5eae32e04dfcf3b8c2557fe191264c2',
    8,
    291,
  ],
] as const;

// The generated JavaScript stays byte-identical; this is a test-only template.
const boundaryTemplate = `import cp from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import dgram from 'node:dgram';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports, registerHooks } from 'node:module';
const log = __ATTEMPTS__;
const record = fs.appendFileSync.bind(fs);
const owned = __OWNED__;
const sources = __SOURCES__;
let loaderPhaseOpen = true;
function phase() { return loaderPhaseOpen ? 'startup' : 'sealed'; }
function observe(name, detail = {}) { record(__TIMELINE__, JSON.stringify({name, pid:process.pid, phase:phase(), argv:[...process.argv], ...detail})+'\\n'); }
function note(name) { record(log, JSON.stringify(name) + '\\n'); observe(name); }
const NativeError = Error;
const capture = NativeError.captureStackTrace;
const expectedTmp = path.join(owned, 'tmp');
const tmpVerified = fs.realpathSync(process.env.TMPDIR) === expectedTmp;
const expectedPipe = path.join(expectedTmp, 'tsx-' + process.geteuid(), process.ppid + '.pipe');
function immediateCaller(wrapper) {
  const prepare = NativeError.prepareStackTrace;
  const limit = NativeError.stackTraceLimit;
  try {
    NativeError.prepareStackTrace = (_, frames) => frames;
    NativeError.stackTraceLimit = 8;
    const target = {};
    capture(target, wrapper);
    const frame = Array.isArray(target.stack) ? target.stack[0] : undefined;
    const raw = frame?.getFileName();
    const file = raw ? fs.realpathSync(raw.startsWith('file:') ? fileURLToPath(raw) : raw) : null;
    return { file, line: frame?.getLineNumber(), column: frame?.getColumnNumber() };
  } catch { return null; }
  finally { NativeError.prepareStackTrace = prepare; NativeError.stackTraceLimit = limit; }
}
function deny(name) { return function forbidden(...args) {
  let classification = name;
  if (name === 'net.createConnection') {
    const caller = immediateCaller(forbidden);
    const source = sources.find(item => item.file === caller?.file);
    if (loaderPhaseOpen && tmpVerified && typeof args[0] === 'string' && args[0] === expectedPipe && source &&
      source.expectedHash === source.actualHash && caller.line === source.line && caller.column === source.column) {
      classification = 'loader:tsx-ipc-BLOCKED';
    }
    record(__DIAGNOSTIC__, JSON.stringify({name, classification, caller, phase:phase(),
      actualSourceHash: source?.actualHash ?? null, expectedSources: sources, expectedPipe,
      firstArgType: typeof args[0], firstArg: typeof args[0] === 'string' ? args[0].slice(0,512) : null,
      pid: process.pid, ppid: process.ppid, uid: process.geteuid(), tmpVerified}) + '\\n');
  }
  note(classification);
  throw new NativeError('ENTRY_BOUNDARY_BLOCKED:' + name);
}; }
function writable(target) {
  if (typeof target === 'number') return false;
  const resolved = path.resolve(String(target));
  let parent = resolved;
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const actual = path.resolve(fs.realpathSync(parent), path.relative(parent, resolved));
  return actual === owned || actual.startsWith(owned + path.sep);
}
for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'rmdirSync', 'renameSync', 'copyFileSync']) {
  const original = fs[name];
  fs[name] = function (...args) {
    const targets = name === 'renameSync' || name === 'copyFileSync' ? args.slice(0, 2) : args.slice(0, 1);
    if (targets.length === 0 || targets.some(target => !writable(target))) return deny('fs.' + name)();
    return original.apply(this, args);
  };
}
const spawn = cp.spawn;
for (const name of ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']) cp[name] = deny('child_process.' + name);
// tsx's own frozen compiler service is the only permitted subprocess.
cp.spawn = function (command, args, options) {
  if (command === __ESBUILD__ && JSON.stringify(args) === __SERVICE_ARGS_JSON__) {
    note('loader:owned-esbuild'); return spawn.call(this, command, args, options);
  }
  return deny('child_process.spawn')();
};
for (const [object, names, prefix] of [
  [net, ['connect', 'createConnection'], 'net'],
  [net.Socket.prototype, ['connect'], 'net.Socket'],
  [tls, ['connect'], 'tls'], [http, ['request', 'get'], 'http'],
  [https, ['request', 'get'], 'https'], [http2, ['connect'], 'http2'],
  [dns, ['lookup', 'resolve', 'resolve4', 'resolve6'], 'dns'],
  [dns.promises, ['lookup', 'resolve', 'resolve4', 'resolve6'], 'dns.promises'],
  [dgram, ['createSocket'], 'dgram']
]) for (const name of names) object[name] = deny(prefix + '.' + name);
for (const name of ['fetch', 'WebSocket', 'EventSource']) if (name in globalThis) globalThis[name] = deny(name);
syncBuiltinESMExports();
observe('boundary:installed');
export function sealLoaderClassification() {
  if (!loaderPhaseOpen) { observe('bootstrap:repeat-seal-rejected'); throw new NativeError('SEAL_ALREADY_CLOSED'); }
  loaderPhaseOpen = false;
  registerHooks({resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  if (result.url.startsWith('file:')) {
    const file = fileURLToPath(result.url);
    if (file.startsWith(owned + path.sep) && file !== __BOUNDARY__ && file !== __BOOTSTRAP__) {
      observe('subject:resolved', {url:result.url, parentURL:context.parentURL ?? null});
    }
  }
  return result;
  }});
  observe('bootstrap:sealed');
}
`;

/** Native result plus persistent boundary attempts, including caught exceptions. */
export interface EntryResult {
  readonly process: ReturnType<typeof spawnSync>;
  readonly blocked: string[];
  readonly loaderStarts: string[];
  readonly loaderIpcBlocked: string[];
  readonly timeline: { name: string; pid: number; phase: string; argv: string[]; url?: string }[];
  readonly ipc: {
    classification: string;
    phase: string;
    caller: { file: string } | null;
    pid: number;
  }[];
}

/** Missing logs provide no evidence; envelope assertions require nonempty records. */
function readOwnedRecords<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/** One owned checkout layout, data root, loader cache, and pre-import guard. */
export class ScriptEntryFixture {
  readonly compiler = { binary: esbuildBinary, version: esbuildVersion };
  readonly directory = mkdtempSync(join(root, '.script-entry-'));
  readonly policyRoot = join(this.directory, 'empty-root');
  readonly diagnosticPath = join(this.directory, 'boundary-details.jsonl');
  readonly entry: string;
  private readonly attempts = join(this.directory, 'attempts.jsonl');
  private readonly preload = join(this.directory, 'boundary.mjs');
  private readonly bootstrap = join(this.directory, 'bootstrap.mjs');
  private readonly timelinePath = join(this.directory, 'timeline.jsonl');

  constructor(script: string, component: string) {
    const checkout = join(this.directory, component);
    this.entry = join(checkout, 'scripts', script);
    mkdirSync(dirname(this.entry), { recursive: true });
    mkdirSync(this.policyRoot);
    mkdirSync(join(this.directory, 'tmp'));
    copyFileSync(join(root, 'scripts', script), this.entry);
    writeFileSync(join(checkout, 'package.json'), '{"type":"module"}\n');
    symlinkSync(join(root, 'packages'), join(checkout, 'packages'), 'dir');
    for (const helper of [
      'script-paths.ts',
      'model-string-drift-allowlist.ts',
      'vote-record-ratification.ts',
    ]) {
      symlinkSync(join(root, 'scripts', helper), join(checkout, 'scripts', helper));
    }
    // Valid YAML with an intentionally invalid schema reaches the real validator.
    if (script === 'check-authority-tier-drift.ts') {
      mkdirSync(join(this.policyRoot, 'governance'));
      writeFileSync(join(this.policyRoot, 'governance/authority-tier-evidence.yaml'), '{}\n');
    }
    writeFileSync(this.preload, this.boundarySource());
    const loaderDirectory = dirname(realpathSync(loader));
    writeFileSync(
      this.bootstrap,
      `const boundary = await import(${JSON.stringify(pathToFileURL(this.preload).href)});
await import(${JSON.stringify(pathToFileURL(realpathSync(loader)).href)});
await import(${JSON.stringify(pathToFileURL(join(loaderDirectory, loaderPolicy[0][0])).href)});
await import(${JSON.stringify(pathToFileURL(join(loaderDirectory, loaderPolicy[1][0])).href)});
boundary.sealLoaderClassification();
`
    );
  }

  private boundarySource(): string {
    const sources = loaderPolicy.map(([name, expectedHash, line, column]) => {
      const file = realpathSync(join(dirname(realpathSync(loader)), name));
      return {
        file,
        expectedHash,
        actualHash: createHash('sha256').update(readFileSync(file)).digest('hex'),
        line,
        column,
      };
    });
    const values: Record<string, string> = {
      __ATTEMPTS__: JSON.stringify(this.attempts),
      __OWNED__: JSON.stringify(this.directory),
      __SOURCES__: JSON.stringify(sources),
      __TIMELINE__: JSON.stringify(this.timelinePath),
      __DIAGNOSTIC__: JSON.stringify(this.diagnosticPath),
      __ESBUILD__: JSON.stringify(esbuildBinary),
      __SERVICE_ARGS_JSON__: JSON.stringify(
        JSON.stringify(['--service=' + esbuildVersion, '--ping'])
      ),
      __BOUNDARY__: JSON.stringify(this.preload),
      __BOOTSTRAP__: JSON.stringify(this.bootstrap),
    };
    return boundaryTemplate.replace(/__[A-Z_]+__/g, (token) => {
      const value = values[token];
      if (value === undefined) throw new Error(`Unknown boundary token: ${token}`);
      return value;
    });
  }

  /** Execute an actual entry or import after the boundary is installed. */
  run(mode: 'direct' | 'import', args: string[] = []): EntryResult {
    const invocation =
      mode === 'direct'
        ? [this.entry, ...args]
        : [
            '--input-type=module',
            '--eval',
            `await import(${JSON.stringify(pathToFileURL(this.entry).href)}); console.log('TEST_IMPORT_COMPLETE');`,
            '--',
            ...args,
          ];
    return this.execute(invocation);
  }

  /** Deliberate forbidden calls prove the guard was active before module import. */
  probe(source: string, filename = 'probe.mjs', args: string[] = []): EntryResult {
    const target = join(this.directory, filename);
    writeFileSync(target, source);
    return this.execute([target, ...args]);
  }

  private execute(args: string[]): EntryResult {
    for (const log of [this.attempts, this.diagnosticPath, this.timelinePath]) {
      if (existsSync(log)) rmSync(log);
    }
    const result = spawnSync(process.execPath, ['--import', this.bootstrap, ...args], {
      cwd: this.directory,
      env: {
        PATH: '',
        HOME: this.directory,
        TMPDIR: join(this.directory, 'tmp'),
        NEXUS_DATA_DIR: join(this.directory, 'data'),
        NEXUS_SCRIPT_ROOT: this.policyRoot,
      },
      encoding: 'utf8',
      timeout: 20_000,
    });
    const attempts = readOwnedRecords<string>(this.attempts);
    const evidence: EntryResult = {
      process: result,
      blocked: attempts.filter(
        (name) => name !== 'loader:owned-esbuild' && name !== 'loader:tsx-ipc-BLOCKED'
      ),
      loaderStarts: attempts.filter((name) => name === 'loader:owned-esbuild'),
      loaderIpcBlocked: attempts.filter((name) => name === 'loader:tsx-ipc-BLOCKED'),
      timeline: readOwnedRecords<EntryResult['timeline'][number]>(this.timelinePath),
      ipc: readOwnedRecords<EntryResult['ipc'][number]>(this.diagnosticPath),
    };
    const evidenceFile = process.env['NEXUS_ENTRY_EVIDENCE_FILE'];
    if (evidenceFile !== undefined) {
      appendFileSync(
        evidenceFile,
        JSON.stringify({
          entry: this.entry,
          args,
          ...evidence,
          envelopeScope:
            'Observed Node resolve URLs and pre-evaluation argv; original-source lexical import.meta is not directly measured.',
        }) + '\n'
      );
    }
    return evidence;
  }

  close(): void {
    rmSync(this.directory, { recursive: true, force: true });
  }
}
