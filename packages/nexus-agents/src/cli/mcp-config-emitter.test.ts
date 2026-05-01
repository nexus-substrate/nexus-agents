/**
 * Tests for MCP config emitter (#2308, child of #2301).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MCP_CONFIG_FILENAME,
  NEXUS_SERVER_KEY,
  buildNexusServerEntry,
  emitMcpConfig,
  entriesEqual,
} from './mcp-config-emitter.js';

let workspace: string;
let dataDir: string;

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mcp-test-'));
  dataDir = path.join(workspace, '.nexus-agents');
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe('buildNexusServerEntry', () => {
  it('produces the canonical shape', () => {
    const e = buildNexusServerEntry('/abs/path');
    expect(e.command).toBe('nexus-agents');
    expect(e.args).toEqual(['--mode=server']);
    expect(e.env?.NEXUS_DATA_DIR).toBe('/abs/path');
  });
});

describe('entriesEqual', () => {
  it('matches identical entries', () => {
    const a = buildNexusServerEntry('/x');
    const b = buildNexusServerEntry('/x');
    expect(entriesEqual(a, b)).toBe(true);
  });

  it('rejects differing data dir', () => {
    expect(entriesEqual(buildNexusServerEntry('/x'), buildNexusServerEntry('/y'))).toBe(false);
  });

  it('rejects differing args length', () => {
    const a = buildNexusServerEntry('/x');
    const b = { ...a, args: [...a.args, 'extra'] };
    expect(entriesEqual(a, b)).toBe(false);
  });

  it('rejects differing command', () => {
    const a = buildNexusServerEntry('/x');
    const b = { ...a, command: 'something-else' };
    expect(entriesEqual(a, b)).toBe(false);
  });

  it('handles missing env on either side', () => {
    const a = { command: 'nexus-agents', args: ['--mode=server'] };
    const b = { command: 'nexus-agents', args: ['--mode=server'] };
    expect(entriesEqual(a, b)).toBe(true);
  });
});

describe('emitMcpConfig — fresh workspace', () => {
  it('writes a new .mcp.json with the canonical entry', () => {
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true);
    expect(result.alreadyMatched).toBe(false);
    expect(result.mcpConfigPath).toBe(path.join(workspace, MCP_CONFIG_FILENAME));
    expect(fs.existsSync(result.mcpConfigPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8')) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
    };
    expect(parsed.mcpServers[NEXUS_SERVER_KEY]?.command).toBe('nexus-agents');
    expect(parsed.mcpServers[NEXUS_SERVER_KEY]?.env.NEXUS_DATA_DIR).toBe(dataDir);
  });

  it('does NOT update .gitignore when no .git directory exists', () => {
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.gitignoreUpdated).toBe(false);
    expect(fs.existsSync(path.join(workspace, '.gitignore'))).toBe(false);
  });

  it('auto-appends .mcp.json to .gitignore when .git exists', () => {
    fs.mkdirSync(path.join(workspace, '.git'));
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.gitignoreUpdated).toBe(true);
    const ignore = fs.readFileSync(path.join(workspace, '.gitignore'), 'utf-8');
    expect(ignore).toContain(MCP_CONFIG_FILENAME);
  });

  it('does not duplicate the .gitignore entry on re-run', () => {
    fs.mkdirSync(path.join(workspace, '.git'));
    emitMcpConfig({ workspaceDir: workspace, dataDir });
    // First run wrote the entry. Modify the entry slightly and force re-write to trigger gitignore again
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({ mcpServers: { [NEXUS_SERVER_KEY]: buildNexusServerEntry('/different') } })
    );
    const r2 = emitMcpConfig({ workspaceDir: workspace, dataDir, force: true });
    expect(r2.gitignoreUpdated).toBe(false); // already there
  });
});

describe('emitMcpConfig — existing .mcp.json', () => {
  it('merges into existing config preserving other servers', () => {
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({
        mcpServers: {
          'other-server': { command: 'other', args: [] },
        },
      })
    );

    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8')) as {
      mcpServers: Record<string, { command: string }>;
    };
    expect(parsed.mcpServers['other-server']?.command).toBe('other');
    expect(parsed.mcpServers[NEXUS_SERVER_KEY]?.command).toBe('nexus-agents');
  });

  it('preserves unknown top-level keys on round-trip', () => {
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({
        $schema: 'https://example.com/schema.json',
        mcpServers: {},
      })
    );
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8')) as {
      $schema: string;
    };
    expect(parsed.$schema).toBe('https://example.com/schema.json');
  });

  it('returns alreadyMatched when entry already matches', () => {
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({ mcpServers: { [NEXUS_SERVER_KEY]: buildNexusServerEntry(dataDir) } })
    );
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(true);
    expect(result.alreadyMatched).toBe(true);
    expect(result.written).toBe(false);
  });

  it('refuses to overwrite a differing nexus-agents entry without force', () => {
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({ mcpServers: { [NEXUS_SERVER_KEY]: buildNexusServerEntry('/wrong/path') } })
    );
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('differs');
    expect(result.error).toContain('--force');
  });

  it('replaces a differing entry when force is true', () => {
    fs.writeFileSync(
      path.join(workspace, MCP_CONFIG_FILENAME),
      JSON.stringify({ mcpServers: { [NEXUS_SERVER_KEY]: buildNexusServerEntry('/wrong/path') } })
    );
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir, force: true });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(result.mcpConfigPath, 'utf-8')) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(parsed.mcpServers[NEXUS_SERVER_KEY]?.env.NEXUS_DATA_DIR).toBe(dataDir);
  });

  it('returns a failure on invalid JSON', () => {
    fs.writeFileSync(path.join(workspace, MCP_CONFIG_FILENAME), '{ broken json');
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid JSON');
  });

  it('returns a failure when top-level JSON is not an object', () => {
    fs.writeFileSync(path.join(workspace, MCP_CONFIG_FILENAME), '"a string"');
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir });
    expect(result.success).toBe(false);
  });
});

describe('emitMcpConfig — dry run', () => {
  it('returns success without writing the file', () => {
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.written).toBe(true); // logically would have written
    expect(fs.existsSync(result.mcpConfigPath)).toBe(false);
  });

  it('returns success without modifying .gitignore', () => {
    fs.mkdirSync(path.join(workspace, '.git'));
    const result = emitMcpConfig({ workspaceDir: workspace, dataDir, dryRun: true });
    expect(result.success).toBe(true);
    expect(result.gitignoreUpdated).toBe(true); // logically would have updated
    expect(fs.existsSync(path.join(workspace, '.gitignore'))).toBe(false);
  });
});
