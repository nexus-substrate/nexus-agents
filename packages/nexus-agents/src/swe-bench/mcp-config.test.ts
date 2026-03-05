/**
 * Tests for MCP config generation for child Claude CLI sessions.
 * @module swe-bench/mcp-config.test
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFile, stat } from 'node:fs/promises';
import { generateMcpConfig, getDefaultAllowedTools } from './mcp-config.js';

describe('mcp-config', () => {
  const cleanupFns: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanupFns) {
      await fn();
    }
    cleanupFns.length = 0;
  });

  describe('generateMcpConfig', () => {
    it('should create a config file with nexus-agents server', async () => {
      const result = await generateMcpConfig();
      cleanupFns.push(result.cleanup);

      const content = await readFile(result.configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;

      expect(config).toHaveProperty('mcpServers');
      const servers = config['mcpServers'] as Record<string, unknown>;
      expect(servers).toHaveProperty('nexus-agents');

      const server = servers['nexus-agents'] as Record<string, unknown>;
      expect(server['command']).toBe('node');
      expect(server['args']).toEqual(
        expect.arrayContaining([expect.stringContaining('cli.js'), '--mode=server'])
      );
    });

    it('should use custom CLI path when provided', async () => {
      const result = await generateMcpConfig({
        cliPath: '/custom/path/cli.js',
      });
      cleanupFns.push(result.cleanup);

      const content = await readFile(result.configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;
      const servers = config['mcpServers'] as Record<string, unknown>;
      const server = servers['nexus-agents'] as Record<string, unknown>;
      const args = server['args'] as string[];

      expect(args[0]).toBe('/custom/path/cli.js');
    });

    it('should include env vars when provided', async () => {
      const result = await generateMcpConfig({
        env: { NEXUS_LOG_LEVEL: 'debug' },
      });
      cleanupFns.push(result.cleanup);

      const content = await readFile(result.configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;
      const servers = config['mcpServers'] as Record<string, unknown>;
      const server = servers['nexus-agents'] as Record<string, unknown>;

      expect(server['env']).toEqual({ NEXUS_LOG_LEVEL: 'debug' });
    });

    it('should not include env key when no env provided', async () => {
      const result = await generateMcpConfig();
      cleanupFns.push(result.cleanup);

      const content = await readFile(result.configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;
      const servers = config['mcpServers'] as Record<string, unknown>;
      const server = servers['nexus-agents'] as Record<string, unknown>;

      expect(server).not.toHaveProperty('env');
    });

    it('should return default allowed tools', async () => {
      const result = await generateMcpConfig();
      cleanupFns.push(result.cleanup);

      expect(result.allowedTools).toEqual(getDefaultAllowedTools());
      expect(result.allowedTools.length).toBeGreaterThan(0);
    });

    it('should return custom allowed tools when provided', async () => {
      const tools = ['memory_query'];
      const result = await generateMcpConfig({ allowedTools: tools });
      cleanupFns.push(result.cleanup);

      expect(result.allowedTools).toEqual(tools);
    });

    it('should cleanup temp files', async () => {
      const result = await generateMcpConfig();
      const configPath = result.configPath;

      // File exists before cleanup
      await expect(stat(configPath)).resolves.toBeDefined();

      await result.cleanup();

      // File gone after cleanup
      await expect(stat(configPath)).rejects.toThrow();
    });

    it('should create file in temp directory', async () => {
      const result = await generateMcpConfig();
      cleanupFns.push(result.cleanup);

      expect(result.configPath).toContain('nexus-mcp-');
      expect(result.configPath).toMatch(/mcp-config\.json$/);
    });
  });

  describe('getDefaultAllowedTools', () => {
    it('should return read-only tools', () => {
      const tools = getDefaultAllowedTools();

      expect(tools).toContain('memory_query');
      expect(tools).toContain('research_query');
      expect(tools).toContain('weather_report');
      // Should NOT contain write/mutation tools
      expect(tools).not.toContain('orchestrate');
      expect(tools).not.toContain('create_expert');
      expect(tools).not.toContain('memory_write');
    });
  });
});
