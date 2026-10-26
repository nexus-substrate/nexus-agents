/** Literal checkout identity must be measured before project tooling starts. */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../../../..');

const CHECKER = join(REPOSITORY_ROOT, 'scripts/check-native-canary-snapshot.py');
const MANIFEST = 'governance/native-approval-canary-source-snapshot.json';
const LEDGER = 'governance/vote-records.jsonl';
const roots: string[] = [];
const env = { PATH: process.env['PATH'], LANG: 'C.UTF-8' };
const PYTHON = execFileSync('python3', ['-I', '-S', '-c', 'import sys; print(sys.executable)'], {
  encoding: 'utf8',
}).trim();
const GIT = execFileSync(PYTHON, ['-I', '-S', '-c', 'import shutil; print(shutil.which("git"))'], {
  encoding: 'utf8',
}).trim();
function git(root: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    { cwd: root, env, encoding: 'utf8', timeout: 5000 }
  );
}
function run(
  root: string,
  mode = '--check',
  extra: Record<string, string> = {}
): { code: number | null; stdout: string; stderr: string } {
  const child = spawnSync(PYTHON, ['-I', '-S', CHECKER, mode], {
    cwd: root,
    env: { ...env, ...extra },
    encoding: 'utf8',
    timeout: 15000,
  });
  return { code: child.status, stdout: child.stdout, stderr: child.stderr };
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'canary-snapshot-'));
  roots.push(root);
  git(root, 'init', '-q');
  mkdirSync(join(root, 'governance'));
  writeFileSync(join(root, 'source.txt'), 'trusted bytes\n');
  writeFileSync(join(root, '.gitignore'), 'ignored.txt\n.nexus-agents/\n');
  writeFileSync(join(root, LEDGER), '');
  writeFileSync(join(root, MANIFEST), '{}\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return root;
}
function ready(): string {
  const root = fixture();
  expect(run(root, '--write').code).toBe(0);
  git(root, 'add', MANIFEST);
  git(root, 'commit', '-qm', 'manifest');
  return root;
}
function editManifest(root: string, edit: (v: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8')) as Record<string, unknown>;
  edit(value);
  writeFileSync(join(root, MANIFEST), JSON.stringify(value));
}
function gitWrapper(program: string): string {
  const root = mkdtempSync(join(tmpdir(), 'canary-host-git-'));
  roots.push(root);
  writeFileSync(join(root, 'git'), `#!${process.execPath}\n${program}\n`, { mode: 0o755 });
  return root;
}
const DELEGATE = `const {spawnSync}=await import('node:child_process');const r=spawnSync(${JSON.stringify(GIT)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);`;
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('isolated one-shot canary source snapshot', () => {
  it('accepts an exact nonempty checkout and reports its hashes', () => {
    const root = ready();
    const result = run(root);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      status: 'verified',
      complete: true,
      sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      manifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });
  it('names missing Git and unavailable no-filters support without falling back', () => {
    const root = ready();
    expect(run(root, '--check', { PATH: '/nonexistent-fixture-bin' }).stdout).toContain(
      'git-unavailable'
    );
    const second = ready();
    const bin = gitWrapper(`if(process.argv.includes('hash-object'))process.exit(9);${DELEGATE}`);
    expect(run(second, '--check', { PATH: bin }).stdout).toContain('git-literal-hash-unavailable');
  });
  it('refuses truncated NUL-delimited Git output', () => {
    const root = ready();
    const bin = gitWrapper(
      `if(process.argv.includes('ls-files')&&process.argv.includes('--stage')){process.stdout.write('truncated');process.exit(0)}${DELEGATE}`
    );
    expect(
      execFileSync(join(bin, 'git'), ['rev-parse', '--show-toplevel'], {
        cwd: root,
        env,
        encoding: 'utf8',
      }).trim()
    ).toBe(root);
    const output = JSON.parse(run(root, '--check', { PATH: bin }).stdout) as unknown;
    expect(output).toMatchObject({ reason: 'git-rows-empty-or-truncated' });
  });
  it('stops a Git subprocess when its output exceeds the bound', () => {
    const root = ready();
    const bin = gitWrapper(`process.stdout.write('x'.repeat(16000001));`);
    expect(run(root, '--check', { PATH: bin }).stdout).toContain('git-output-limit');
  });
  it('refuses a manifest authored for another object format', () => {
    const root = ready();
    editManifest(root, (value) => {
      value['objectFormat'] = 'sha256';
      value['authoredBaseTree'] = 'a'.repeat(64);
    });
    expect(run(root).stdout).toContain('object-format-mismatch');
  });
  it.each(['CI', 'GITHUB_ACTIONS'])('refuses authoring when %s is set', (key) => {
    expect(run(fixture(), '--write', { [key]: 'false' }).code).toBe(1);
  });
  it.each(['source.txt', 'ignored.txt', 'untracked.txt'])(
    'refuses changed or extra %s before tooling',
    (path) => {
      const root = ready();
      writeFileSync(join(root, path), 'changed bytes\n');
      expect(run(root).code).toBe(1);
      const record = JSON.parse(
        readFileSync(
          join(root, '.nexus-agents/native-approval-canary/source-snapshot.json'),
          'utf8'
        )
      ) as unknown;
      expect(record).toMatchObject({ status: 'refused', complete: false, writeAttempted: false });
    }
  );
  it('refuses an executable mode change even with core.filemode disabled', () => {
    const root = ready();
    git(root, 'config', 'core.filemode', 'false');
    chmodSync(join(root, 'source.txt'), 0o755);
    expect(run(root).code).toBe(1);
  });
  it('refuses normalized CRLF bytes even when Git status considers them equivalent', () => {
    const root = fixture();
    writeFileSync(join(root, '.gitattributes'), '* text=auto\n');
    git(root, 'add', '.gitattributes');
    git(root, 'commit', '-qm', 'attributes');
    expect(run(root, '--write').code).toBe(0);
    git(root, 'add', MANIFEST);
    git(root, 'commit', '-qm', 'manifest');
    writeFileSync(join(root, 'source.txt'), 'trusted bytes\r\n');
    // Refresh the index stat cache through Git's normal text conversion. The
    // source OID is still HEAD's LF blob while the worktree retains CRLF bytes.
    git(root, 'add', 'source.txt');
    expect(git(root, 'rev-parse', ':source.txt').trim()).toBe(
      git(root, 'rev-parse', 'HEAD:source.txt').trim()
    );
    expect(
      git(root, 'status', '--porcelain', '--untracked-files=no', '--', 'source.txt').trim()
    ).toBe('');
    expect(run(root).code).toBe(1);
  });
  it('refuses a staged source change', () => {
    const root = ready();
    writeFileSync(join(root, 'source.txt'), 'staged\n');
    git(root, 'add', 'source.txt');
    expect(run(root).code).toBe(1);
  });
  it('refuses non-stage-zero index entries', () => {
    const root = ready();
    const oid = git(root, 'rev-parse', 'HEAD:source.txt').trim();
    execFileSync('git', ['update-index', '--index-info'], {
      cwd: root,
      env,
      input: `0 ${'0'.repeat(40)}\tsource.txt\n100644 ${oid} 1\tsource.txt\n100644 ${oid} 2\tsource.txt\n`,
      timeout: 5000,
    });
    expect(run(root).code).toBe(1);
  });
  it('refuses a symlink instead of following it', () => {
    const root = ready();
    rmSync(join(root, 'source.txt'));
    symlinkSync('/etc/hostname', join(root, 'source.txt'));
    expect(run(root).code).toBe(1);
  });
  it('refuses a gitlink instead of omitting its contents', () => {
    const root = ready();
    git(
      root,
      'update-index',
      '--add',
      '--cacheinfo',
      '160000',
      git(root, 'rev-parse', 'HEAD').trim(),
      'submodule'
    );
    expect(run(root).stdout).toContain('unsupported-source-mode');
  });
  it('refuses the actual loader alias before the harmless marker executes', () => {
    const root = fixture();
    const external = mkdtempSync(join(tmpdir(), 'canary-alias-marker-'));
    roots.push(external);
    const marker = join(external, 'marker');
    writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{}}');
    writeFileSync(join(root, 'probe.ts'), "import 'fixture-alias';");
    writeFileSync(
      join(root, 'alias.ts'),
      `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'observed');`
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'loader baseline');
    expect(run(root, '--write').code).toBe(0);
    git(root, 'add', MANIFEST);
    git(root, 'commit', '-qm', 'manifest');
    writeFileSync(
      join(root, 'tsconfig.json'),
      '{"compilerOptions":{"paths":{"fixture-alias":["./alias.ts"]}}}'
    );
    const launch = (): void => {
      execFileSync(process.execPath, [fileURLToPath(import.meta.resolve('tsx/cli')), 'probe.ts'], {
        cwd: root,
        env,
        timeout: 10000,
      });
    };
    launch();
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);
    const check = run(root);
    if (check.code === 0) launch();
    expect(check.code).toBe(1);
    expect(check.stdout).toContain('raw-bytes-index-mismatch');
    expect(check.stdout).toContain('tsconfig.json');
    expect(existsSync(marker)).toBe(false);
  });
  it('refuses a missing manifest and a non-repository checkout', () => {
    const root = ready();
    rmSync(join(root, MANIFEST));
    expect(run(root).code).toBe(1);
    rmSync(join(root, '.git'), { recursive: true });
    expect(run(root).code).toBe(1);
  });
  it('refuses an empty measured source set', () => {
    const root = fixture();
    git(root, 'rm', '-q', '.gitignore', 'source.txt');
    git(root, 'commit', '-qm', 'empty sources');
    expect(run(root, '--write').code).toBe(1);
  });
  it('permits the separately governed ledger append without changing source identity', () => {
    const root = ready();
    writeFileSync(join(root, LEDGER), '{"separate":"append-only-gate"}\n');
    expect(run(root).code).toBe(0);
  });
  it.each(['empty', 'hash', 'exclusions', 'unknown', 'boolean-version'])(
    'refuses malformed manifest: %s',
    (kind) => {
      const root = ready();
      editManifest(root, (value) => {
        if (kind === 'empty') value['sourceFileCount'] = 0;
        if (kind === 'hash') value['sourceSha256'] = '0'.repeat(64);
        if (kind === 'exclusions') value['excludedPaths'] = [MANIFEST, LEDGER, 'source.txt'];
        if (kind === 'unknown') value['unreviewedOverride'] = true;
        if (kind === 'boolean-version') value['version'] = true;
      });
      expect(run(root).code).toBe(1);
    }
  );
  it('rejects a stale manifest after an ordinary tracked merge', () => {
    const root = ready();
    writeFileSync(join(root, 'source.txt'), 'new ordinary commit\n');
    git(root, 'add', 'source.txt');
    git(root, 'commit', '-qm', 'ordinary');
    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('snapshot-stale');
    expect(result.stdout).toContain('authoredBaseTree');
  });
  it('does not load repository Python modules or PYTHONPATH hooks', () => {
    const root = fixture();
    writeFileSync(join(root, 'json.py'), "raise RuntimeError('repository module executed')\n");
    git(root, 'add', 'json.py');
    git(root, 'commit', '-qm', 'shadow');
    const result = run(root, '--write', { PYTHONPATH: root });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain('repository module executed');
  });
  it('records one refusal without overwriting an earlier attempt', () => {
    const root = ready();
    writeFileSync(join(root, 'source.txt'), 'changed\n');
    expect(run(root).code).toBe(1);
    const path = join(root, '.nexus-agents/native-approval-canary/source-snapshot.json');
    const first = readFileSync(path, 'utf8');
    run(root);
    expect(readFileSync(path, 'utf8')).toBe(first);
  });
});
