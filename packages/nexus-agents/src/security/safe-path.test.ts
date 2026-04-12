/**
 * Tests for safe-path helpers (#1813, #1814).
 */

import { describe, it, expect } from 'vitest';
import { resolveInsideRoot } from './safe-path.js';
import { resolve } from 'node:path';

describe('resolveInsideRoot', () => {
  const root = resolve(process.cwd());

  it('accepts simple relative paths inside root', () => {
    expect(resolveInsideRoot('src/app.ts')).toBe(resolve(root, 'src/app.ts'));
  });

  it('accepts the root itself', () => {
    expect(resolveInsideRoot('.')).toBe(root);
  });

  it('rejects relative traversal (../../etc/passwd)', () => {
    expect(resolveInsideRoot('../../../../etc/passwd')).toBeNull();
  });

  it('rejects absolute paths outside root', () => {
    expect(resolveInsideRoot('/etc/passwd')).toBeNull();
  });

  it('rejects paths that look inside but escape', () => {
    expect(resolveInsideRoot('src/../../../etc/passwd')).toBeNull();
  });

  it('accepts nested paths', () => {
    expect(resolveInsideRoot('src/foo/bar/baz.ts')).toBe(resolve(root, 'src/foo/bar/baz.ts'));
  });

  it('rejects sibling-root prefix attack (/rootsibling)', () => {
    // If root is /foo, /foobar should not be accepted just because it starts with /foo.
    const tmpRoot = '/tmp/a';
    expect(resolveInsideRoot('/tmp/abc/x', tmpRoot)).toBeNull();
  });

  it('accepts absolute path inside explicit root', () => {
    const tmpRoot = '/tmp/a';
    expect(resolveInsideRoot('/tmp/a/x', tmpRoot)).toBe('/tmp/a/x');
  });
});
