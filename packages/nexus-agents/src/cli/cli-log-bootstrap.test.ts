/**
 * Tests for cli-log-bootstrap (#2443).
 *
 * The bootstrap quiets info-level logs for interactive subcommands. Unit-test
 * the pure logic via the exported `applyCliLogDefault` so we don't have to
 * spawn a child process.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock logger.setGlobalLogLevel so we can assert it was called.
const setGlobalLogLevelMock = vi.fn();
vi.mock('../core/logger.js', () => ({
  setGlobalLogLevel: setGlobalLogLevelMock,
  getGlobalLogLevel: vi.fn(() => 'info'),
}));

// Import AFTER vi.mock so the bootstrap module-load side effect uses the mock.
const { applyCliLogDefault } = await import('./cli-log-bootstrap.js');

describe('applyCliLogDefault (#2443)', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env['NEXUS_LOG_LEVEL'];
    delete process.env['NEXUS_LOG_LEVEL'];
    setGlobalLogLevelMock.mockClear();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['NEXUS_LOG_LEVEL'];
    else process.env['NEXUS_LOG_LEVEL'] = originalEnv;
  });

  it('quiets to warn when an interactive subcommand has no overrides', () => {
    applyCliLogDefault(['vote', '--quick', '--proposal', 'x']);
    expect(setGlobalLogLevelMock).toHaveBeenCalledWith('warn');
  });

  it('quiets for any subcommand by default (allowlist of allowed-quiet, not denylist)', () => {
    applyCliLogDefault(['orchestrate', 'do a thing']);
    expect(setGlobalLogLevelMock).toHaveBeenCalledWith('warn');
  });

  it('does NOT quiet when no subcommand is present (MCP server stdio mode)', () => {
    applyCliLogDefault([]);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when subcommand is `server`', () => {
    applyCliLogDefault(['server']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when --verbose is present', () => {
    applyCliLogDefault(['vote', '--verbose', '--proposal', 'x']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when -v short flag is present', () => {
    applyCliLogDefault(['vote', '-v']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when --debug is present', () => {
    applyCliLogDefault(['vote', '--debug']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when NEXUS_LOG_LEVEL is set explicitly (operator override wins)', () => {
    process.env['NEXUS_LOG_LEVEL'] = 'info';
    applyCliLogDefault(['vote']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('does NOT quiet when NEXUS_LOG_LEVEL is set to debug', () => {
    process.env['NEXUS_LOG_LEVEL'] = 'debug';
    applyCliLogDefault(['vote']);
    expect(setGlobalLogLevelMock).not.toHaveBeenCalled();
  });

  it('treats an empty NEXUS_LOG_LEVEL as unset', () => {
    process.env['NEXUS_LOG_LEVEL'] = '';
    applyCliLogDefault(['vote']);
    expect(setGlobalLogLevelMock).toHaveBeenCalledWith('warn');
  });

  it('finds the subcommand even when flags come before it', () => {
    // nexus-agents --some-flag vote ...
    applyCliLogDefault(['--some-flag', 'vote', '--proposal', 'x']);
    expect(setGlobalLogLevelMock).toHaveBeenCalledWith('warn');
  });
});
