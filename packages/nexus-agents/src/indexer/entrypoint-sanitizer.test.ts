/**
 * Tests for entrypoint-sanitizer.ts
 *
 * Covers value sanitization, parameter/option/command/tool/endpoint redaction
 * of sensitive patterns (API keys, tokens, private IPs, hex strings).
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeValue,
  sanitizeParameter,
  sanitizeOption,
  sanitizeCommand,
  sanitizeTool,
} from './entrypoint-sanitizer.js';

// ============================================================================
// sanitizeValue
// ============================================================================

describe('sanitizeValue', () => {
  it('returns non-sensitive strings unchanged', () => {
    expect(sanitizeValue('hello world')).toBe('hello world');
  });

  it('redacts OpenAI API keys', () => {
    const key = 'sk-' + 'a'.repeat(32);
    expect(sanitizeValue(`Key is ${key}`)).toContain('[REDACTED]');
    expect(sanitizeValue(`Key is ${key}`)).not.toContain(key);
  });

  it('redacts Anthropic API keys', () => {
    const key = 'sk-ant-' + 'a'.repeat(95);
    expect(sanitizeValue(key)).toContain('[REDACTED]');
  });

  it('redacts GitHub PATs', () => {
    const pat = 'ghp_' + 'a'.repeat(36);
    expect(sanitizeValue(pat)).toContain('[REDACTED]');
  });

  it('redacts GitLab PATs', () => {
    const pat = 'glpat-' + 'a'.repeat(20);
    expect(sanitizeValue(pat)).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    expect(sanitizeValue('Bearer abc123.xyz')).toContain('[REDACTED]');
  });

  it('redacts localhost URLs', () => {
    expect(sanitizeValue('Connect to localhost:3000')).toContain('[REDACTED]');
  });

  it('redacts 192.168.x.x private IPs', () => {
    expect(sanitizeValue('Server at 192.168.1.100')).toContain('[REDACTED]');
  });

  it('redacts 10.x.x.x private IPs', () => {
    expect(sanitizeValue('Server at 10.0.0.1')).toContain('[REDACTED]');
  });

  it('redacts 172.16-31.x.x private IPs', () => {
    expect(sanitizeValue('Server at 172.16.0.1')).toContain('[REDACTED]');
    expect(sanitizeValue('Server at 172.31.255.255')).toContain('[REDACTED]');
  });

  it('does not redact short non-sensitive strings', () => {
    expect(sanitizeValue('port 8080')).toBe('port 8080');
  });

  it('handles empty string', () => {
    expect(sanitizeValue('')).toBe('');
  });
});

// ============================================================================
// sanitizeParameter
// ============================================================================

describe('sanitizeParameter', () => {
  it('preserves name and type', () => {
    const param = sanitizeParameter({ name: 'apiKey', type: 'string' });
    expect(param.name).toBe('apiKey');
    expect(param.type).toBe('string');
  });

  it('sanitizes description', () => {
    const param = sanitizeParameter({
      name: 'key',
      type: 'string',
      description: 'Use Bearer abc123.token',
    });
    expect(param.description).toContain('[REDACTED]');
  });

  it('sanitizes default value', () => {
    const param = sanitizeParameter({
      name: 'host',
      type: 'string',
      default: 'localhost:3000',
    });
    expect(param.default).toContain('[REDACTED]');
  });

  it('preserves required flag', () => {
    const param = sanitizeParameter({
      name: 'id',
      type: 'string',
      required: true,
    });
    expect(param.required).toBe(true);
  });

  it('omits undefined optional fields', () => {
    const param = sanitizeParameter({ name: 'x', type: 'number' });
    expect(param.description).toBeUndefined();
    expect(param.default).toBeUndefined();
    expect(param.required).toBeUndefined();
  });
});

// ============================================================================
// sanitizeOption
// ============================================================================

describe('sanitizeOption', () => {
  it('preserves name and type', () => {
    const opt = sanitizeOption({ name: 'verbose', type: 'boolean' });
    expect(opt.name).toBe('verbose');
    expect(opt.type).toBe('boolean');
  });

  it('sanitizes description', () => {
    const opt = sanitizeOption({
      name: 'host',
      type: 'string',
      description: 'Connect to 192.168.1.1',
    });
    expect(opt.description).toContain('[REDACTED]');
  });

  it('preserves short flag', () => {
    const opt = sanitizeOption({
      name: 'verbose',
      type: 'boolean',
      short: 'v',
    });
    expect(opt.short).toBe('v');
  });

  it('sanitizes default value', () => {
    const opt = sanitizeOption({
      name: 'url',
      type: 'string',
      default: 'localhost:8080',
    });
    expect(opt.default).toContain('[REDACTED]');
  });
});

// ============================================================================
// sanitizeCommand
// ============================================================================

describe('sanitizeCommand', () => {
  it('sanitizes command description', () => {
    const cmd = sanitizeCommand({
      name: 'connect',
      description: 'Connect to 10.0.0.1 server',
      source_file: 'src/cli/connect.ts',
      source_line: 1,
    });
    expect(cmd.name).toBe('connect');
    expect(cmd.description).toContain('[REDACTED]');
    expect(cmd.source_file).toBe('src/cli/connect.ts');
  });

  it('preserves subcommands', () => {
    const cmd = sanitizeCommand({
      name: 'workflow',
      description: 'Manage workflows',
      source_file: 'src/cli/workflow.ts',
      source_line: 1,
      subcommands: ['list', 'run'],
    });
    expect(cmd.subcommands).toEqual(['list', 'run']);
  });

  it('sanitizes options within commands', () => {
    const cmd = sanitizeCommand({
      name: 'config',
      description: 'Configuration',
      source_file: 'src/cli/config.ts',
      source_line: 1,
      options: [{ name: 'host', type: 'string', default: 'localhost:3000' }],
    });
    expect(cmd.options?.[0]?.default).toContain('[REDACTED]');
  });
});

// ============================================================================
// sanitizeTool
// ============================================================================

describe('sanitizeTool', () => {
  it('sanitizes tool description and parameters', () => {
    const tool = sanitizeTool({
      name: 'orchestrate',
      description: 'Connect to 192.168.0.1 for orchestration',
      parameters: [{ name: 'token', type: 'string', description: 'Bearer xyz.abc' }],
      source_file: 'src/mcp/tools/index.ts',
      source_line: 10,
    });
    expect(tool.name).toBe('orchestrate');
    expect(tool.description).toContain('[REDACTED]');
    expect(tool.parameters[0]?.description).toContain('[REDACTED]');
  });

  it('preserves source info', () => {
    const tool = sanitizeTool({
      name: 'test',
      description: 'Test tool',
      parameters: [],
      source_file: 'src/mcp/tools/test.ts',
      source_line: 42,
    });
    expect(tool.source_file).toBe('src/mcp/tools/test.ts');
    expect(tool.source_line).toBe(42);
  });
});
