/** Data-directory initialization must not load diagnostic/server machinery (#5129). */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.doMock('./doctor.js', () => {
    throw new Error('DATA_DIR_IMPORT_BOUNDARY: initializer loaded doctor (#5129)');
  });
  vi.doMock('../mcp/server.js', () => {
    throw new Error('DATA_DIR_IMPORT_BOUNDARY: initializer loaded MCP server (#5129)');
  });
});

afterEach(() => {
  vi.doUnmock('./doctor.js');
  vi.doUnmock('../mcp/server.js');
  vi.resetModules();
});

describe('data-directory initializer import boundaries (#5129)', () => {
  it('loads runtime initialization without loading doctor or the MCP server', async () => {
    const { initDataDirectories } = await import('./setup-data-dir.js');

    expect(typeof initDataDirectories).toBe('function');
  });

  it('loads portable initialization without loading doctor or the MCP server', async () => {
    const { initPortable } = await import('./init-portable.js');

    expect(typeof initPortable).toBe('function');
  });
});
