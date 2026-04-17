/**
 * Tests for the step-notification bootstrap (#1930).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { bootstrapStepNotifications, shouldEnableConsoleRenderer } from './step-notifications.js';

const ORIGINAL_ENV = process.env['NEXUS_CONSOLE'];

describe('shouldEnableConsoleRenderer', () => {
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env['NEXUS_CONSOLE'];
    } else {
      process.env['NEXUS_CONSOLE'] = ORIGINAL_ENV;
    }
  });

  it('defaults ON for cli mode', () => {
    delete process.env['NEXUS_CONSOLE'];
    expect(shouldEnableConsoleRenderer('cli')).toBe(true);
  });

  it('defaults OFF for mcp-stdio mode (preserves JSON-RPC frames)', () => {
    delete process.env['NEXUS_CONSOLE'];
    expect(shouldEnableConsoleRenderer('mcp-stdio')).toBe(false);
  });

  it('defaults ON for mcp-http mode (stdio not reserved)', () => {
    delete process.env['NEXUS_CONSOLE'];
    expect(shouldEnableConsoleRenderer('mcp-http')).toBe(true);
  });

  it('NEXUS_CONSOLE=0 forces off even for cli', () => {
    process.env['NEXUS_CONSOLE'] = '0';
    expect(shouldEnableConsoleRenderer('cli')).toBe(false);
  });

  it('NEXUS_CONSOLE=1 forces on even for mcp-stdio', () => {
    process.env['NEXUS_CONSOLE'] = '1';
    expect(shouldEnableConsoleRenderer('mcp-stdio')).toBe(true);
  });

  it('accepts true/false/on/off synonyms', () => {
    process.env['NEXUS_CONSOLE'] = 'false';
    expect(shouldEnableConsoleRenderer('cli')).toBe(false);
    process.env['NEXUS_CONSOLE'] = 'off';
    expect(shouldEnableConsoleRenderer('cli')).toBe(false);
    process.env['NEXUS_CONSOLE'] = 'true';
    expect(shouldEnableConsoleRenderer('mcp-stdio')).toBe(true);
    process.env['NEXUS_CONSOLE'] = 'on';
    expect(shouldEnableConsoleRenderer('mcp-stdio')).toBe(true);
  });
});

describe('bootstrapStepNotifications idempotency', () => {
  it('returns the same handle on repeat calls', () => {
    process.env['NEXUS_CONSOLE'] = '0'; // keep the renderer off for this test
    const first = bootstrapStepNotifications({ mode: 'cli' });
    const second = bootstrapStepNotifications({ mode: 'cli' });
    expect(first).toBe(second);
    first.dispose();
    delete process.env['NEXUS_CONSOLE'];
  });
});
