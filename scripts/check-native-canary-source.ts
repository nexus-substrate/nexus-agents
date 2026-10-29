/**
 * Enumerate project runtime imports without evaluating project code.
 * Node, the installed tsx/TypeScript/gh toolchain, and locked Zod remain trusted;
 * this check does not attest their source or arbitrary subprocess execution.
 * Local/CI command: pnpm exec tsx scripts/check-native-canary-source.ts
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep, join } from 'node:path';
import ts from 'typescript';
import { isGovernorPath, governorPathsFromCodeowners } from './governor-section.js';
import { REPOSITORY_ROOT } from './script-paths.js';

export interface CanarySourceModule {
  path: string;
  sha256: string;
}
export interface CanarySourceClosure {
  status: 'verified' | 'refused' | 'unmeasured';
  complete: boolean;
  modules: CanarySourceModule[];
  externalModules: string[];
  reason?: string;
  at?: string;
  governorPatternCount?: number;
}
const MAX_FILES = 64;
const MAX_FILE_BYTES = 200_000;
const MAX_TOTAL_BYTES = 1_000_000;
const BUILTINS = new Set(
  builtinModules.flatMap((name) => {
    const bare = name.replace(/^node:/, '');
    return [bare, `node:${bare}`];
  })
);
class ClosureStop extends Error {
  constructor(
    readonly status: 'refused' | 'unmeasured',
    reason: string,
    readonly at?: string
  ) {
    super(reason);
  }
}
interface ClosureProgress {
  root: string;
  patterns: readonly string[];
  scheduled: Set<string>;
  pending: string[];
  modules: CanarySourceModule[];
  external: Set<string>;
  bytes: number;
}
interface ImportScan {
  modules: string[];
  failure?: string;
}
const portable = (path: string): string => path.split(sep).join('/');

function projectPath(root: string, absolute: string): string {
  const path = relative(root, absolute);
  if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))
    throw new ClosureStop('refused', 'source-root-escape');
  return portable(path);
}

function readGovernedSource(
  progress: ClosureProgress,
  absolute: string
): { path: string; text: string } {
  const path = projectPath(progress.root, absolute);
  if (!isGovernorPath(path, progress.patterns))
    throw new ClosureStop('refused', 'ungoverned-runtime-source', path);
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink() || realpathSync(absolute) !== absolute)
      throw new ClosureStop('refused', 'symlinked-runtime-source', path);
    if (!stat.isFile()) throw new ClosureStop('unmeasured', 'runtime-source-unreadable', path);
    if (stat.size > MAX_FILE_BYTES) throw new ClosureStop('unmeasured', 'source-size-limit', path);
    const text = readFileSync(absolute, 'utf8');
    const bytes = Buffer.byteLength(text);
    progress.bytes += bytes;
    if (bytes > MAX_FILE_BYTES || progress.bytes > MAX_TOTAL_BYTES)
      throw new ClosureStop('unmeasured', 'source-size-limit', path);
    progress.modules.push({ path, sha256: createHash('sha256').update(text).digest('hex') });
    return { path, text };
  } catch (error) {
    if (error instanceof ClosureStop) throw error;
    throw new ClosureStop('unmeasured', 'runtime-source-unreadable', path);
  }
}

function literalModule(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}
function unsupportedLoader(node: ts.Node): boolean {
  return (
    (ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)) ||
    ((ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      ts.isIdentifier(node.expression) &&
      ['eval', 'Function'].includes(node.expression.text))
  );
}

function scanCall(node: ts.CallExpression, scan: ImportScan): void {
  const loader =
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require');
  if (!loader) return;
  const argument = node.arguments[0];
  const name = argument === undefined ? undefined : literalModule(argument);
  if (node.arguments.length !== 1) scan.failure = 'unsupported-runtime-import';
  else if (name === undefined) scan.failure = 'computed-runtime-import';
  else scan.modules.push(name);
}

function scanNode(node: ts.Node, scan: ImportScan): void {
  if (scan.failure !== undefined) return;
  if (unsupportedLoader(node)) {
    scan.failure = 'unsupported-runtime-import';
    return;
  }
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier;
    if (specifier !== undefined) {
      const name = literalModule(specifier);
      if (name === undefined) scan.failure = 'computed-runtime-import';
      else scan.modules.push(name);
    }
  } else if (ts.isCallExpression(node)) scanCall(node, scan);
  ts.forEachChild(node, (child) => {
    scanNode(child, scan);
  });
}

function runtimeImports(path: string, text: string): string[] {
  const original = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const originalScan: ImportScan = { modules: [] };
  scanNode(original, originalScan);
  if (originalScan.failure !== undefined)
    throw new ClosureStop('refused', originalScan.failure, path);
  const output = ts.transpileModule(text, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2024,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: true,
    },
  });
  // Empty diagnostics means the compiler measured no syntax errors. Missing is not empty.
  if (
    output.diagnostics === undefined ||
    output.diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)
  )
    throw new ClosureStop('unmeasured', 'source-syntax-unmeasured', path);
  const tree = ts.createSourceFile(
    path + '.js',
    output.outputText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const scan: ImportScan = { modules: [] };
  scanNode(tree, scan);
  if (scan.failure !== undefined) throw new ClosureStop('refused', scan.failure, path);
  // Empty imports is a measured leaf, after successful compilation and AST traversal.
  return scan.modules;
}

function enqueueImports(
  progress: ClosureProgress,
  absolute: string,
  imports: readonly string[]
): void {
  for (const specifier of imports) {
    if (['module', 'node:module', 'vm', 'node:vm'].includes(specifier))
      throw new ClosureStop(
        'refused',
        'unsupported-external-module',
        projectPath(progress.root, absolute)
      );
    if (BUILTINS.has(specifier) || specifier === 'zod') {
      progress.external.add(specifier);
      continue;
    }
    if (!specifier.startsWith('.'))
      throw new ClosureStop(
        'refused',
        'unsupported-external-module',
        projectPath(progress.root, absolute)
      );
    if (!/\.(?:js|ts)$/.test(specifier))
      throw new ClosureStop(
        'refused',
        'unsupported-project-import',
        projectPath(progress.root, absolute)
      );
    const target = resolve(dirname(absolute), specifier.replace(/\.js$/, '.ts'));
    projectPath(progress.root, target);
    queueSource(progress, target);
  }
}

function queueSource(progress: ClosureProgress, absolute: string): void {
  if (progress.scheduled.has(absolute)) return;
  if (progress.scheduled.size >= MAX_FILES)
    throw new ClosureStop('unmeasured', 'source-graph-limit');
  progress.scheduled.add(absolute);
  progress.pending.push(absolute);
}

function traverse(progress: ClosureProgress): void {
  while (progress.pending.length > 0) {
    const next = progress.pending.shift();
    if (next === undefined) throw new ClosureStop('unmeasured', 'entry-missing');
    const source = readGovernedSource(progress, next);
    enqueueImports(progress, next, runtimeImports(source.path, source.text));
  }
}

/** Report complete only for a nonempty, fully traversed governed project closure. */
export function assessCanarySourceClosure(
  root: string,
  entry: string,
  patterns: readonly string[]
): CanarySourceClosure {
  const progress: ClosureProgress = {
    root,
    patterns,
    scheduled: new Set(),
    pending: [],
    modules: [],
    external: new Set(),
    bytes: 0,
  };
  try {
    if (patterns.length === 0) throw new ClosureStop('unmeasured', 'governor-coverage-missing');
    if (entry.length === 0) throw new ClosureStop('unmeasured', 'entry-missing');
    if (isAbsolute(entry)) throw new ClosureStop('refused', 'source-root-escape');
    progress.root = realpathSync(root);
    const first = resolve(progress.root, entry);
    projectPath(progress.root, first);
    queueSource(progress, first);
    traverse(progress);
    if (progress.modules.length === 0) throw new ClosureStop('unmeasured', 'entry-missing');
    return {
      status: 'verified',
      complete: true,
      modules: progress.modules.sort((a, b) => a.path.localeCompare(b.path)),
      externalModules: [...progress.external].sort(),
    };
  } catch (error) {
    const failure =
      error instanceof ClosureStop
        ? error
        : new ClosureStop('unmeasured', 'source-analysis-unmeasured');
    return {
      status: failure.status,
      complete: false,
      reason: failure.message,
      modules: progress.modules,
      externalModules: [...progress.external].sort(),
      ...(failure.at !== undefined ? { at: failure.at } : {}),
    };
  }
}

function committedPaths(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null)
    throw new ClosureStop('unmeasured', 'runtime-closure-snapshot-unmeasured');
  if (Object.keys(value).length !== 2 || !('version' in value) || value.version !== 1)
    throw new ClosureStop('unmeasured', 'runtime-closure-snapshot-unmeasured');
  if (!('paths' in value) || !Array.isArray(value.paths))
    throw new ClosureStop('unmeasured', 'runtime-closure-snapshot-unmeasured');
  return value.paths;
}

function compareCommittedClosure(root: string, result: CanarySourceClosure): void {
  if (!result.complete) return;
  const path = join(root, 'governance/native-approval-canary-runtime-closure.json');
  let value: unknown;
  try {
    if (lstatSync(path).size > 16_384) throw new Error('oversized');
    value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new ClosureStop('unmeasured', 'runtime-closure-snapshot-unmeasured');
  }
  const paths = committedPaths(value);
  if (paths.length === 0 || paths.length > MAX_FILES)
    throw new ClosureStop('unmeasured', 'runtime-closure-snapshot-unmeasured');
  const actual = result.modules.map((module) => module.path);
  if (JSON.stringify(paths) !== JSON.stringify(actual))
    throw new ClosureStop('refused', 'runtime-closure-snapshot-mismatch');
}

function prepareSourcePreflight(
  root: string,
  env: Readonly<Record<string, string | undefined>>
): CanarySourceClosure {
  if ((env['GH_TOKEN']?.length ?? 0) > 0 || (env['GITHUB_TOKEN']?.length ?? 0) > 0)
    throw new ClosureStop('refused', 'credentials-exposed-before-source-check');
  if (env['NEXUS_SCRIPT_ROOT'] !== undefined)
    throw new ClosureStop('refused', 'source-root-override-refused');
  let patterns: string[];
  try {
    patterns = governorPathsFromCodeowners(readFileSync(join(root, 'CODEOWNERS'), 'utf8'));
  } catch {
    throw new ClosureStop('unmeasured', 'governor-coverage-missing');
  }
  const result = assessCanarySourceClosure(root, 'scripts/native-approval-canary.ts', patterns);
  compareCommittedClosure(root, result);
  return { ...result, governorPatternCount: patterns.length };
}

/** The workflow invokes this before setting its GitHub token environment. */
export function runCanarySourcePreflight(
  root: string,
  env: Readonly<Record<string, string | undefined>>
): CanarySourceClosure {
  let result: CanarySourceClosure;
  try {
    result = prepareSourcePreflight(root, env);
  } catch (error) {
    const failure =
      error instanceof ClosureStop
        ? error
        : new ClosureStop('unmeasured', 'source-analysis-unmeasured');
    result = {
      status: failure.status,
      reason: failure.message,
      complete: false,
      modules: [],
      externalModules: [],
    };
  }
  const directory = join(root, '.nexus-agents/native-approval-canary');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(directory, 'source-closure.json'),
    JSON.stringify(
      {
        scope: 'static-project-runtime-imports',
        externalTrust: ['Node', 'tsx', 'TypeScript', 'gh', 'locked Zod'],
        ...result,
      },
      null,
      2
    ) + '\n',
    { flag: 'wx', mode: 0o600 }
  );
  return result;
}

if (process.argv[1]?.endsWith('check-native-canary-source.ts') === true) {
  try {
    const result = runCanarySourcePreflight(REPOSITORY_ROOT, process.env);
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'verified' && result.complete ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({ status: 'unmeasured', reason: 'source-check-record-unavailable' })
    );
    process.exitCode = 1;
  }
}
