/**
 * Claude CLI read-only analysis mode — live smoke test (#6754).
 *
 * Runs the real `claude` binary with the argv the adapter builds for a
 * read-only task and asks it to use Bash. Opt-in and never part of CI: it
 * needs the binary, an authenticated account and one model call.
 *
 * Run via: CLAUDE_READ_ONLY_E2E=true pnpm vitest run src/cli-adapters/adapters/claude-read-only.e2e.test.ts
 *
 * The run uses `--output-format stream-json --verbose` in place of the
 * adapter's `json`, because the single JSON result does not show tool use:
 * measured on claude 2.1.281, a WebSearch that returned live results left
 * `server_tool_use.web_search_requests` at 0 and `permission_denials` empty.
 * The stream's `system/init` event lists the tools the session was offered,
 * which is deterministic, and its `tool_use` blocks show what the model called.
 * With WebSearch added to the allow list, both assertions fail.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliTask } from '../types.js';
import type { CommandConfig } from '../subprocess-adapter.js';
import { ClaudeCliAdapter } from './claude-adapter.js';

const OPTED_IN = process.env['CLAUDE_READ_ONLY_E2E'] === 'true';

function claudeOnPath(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 10_000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

class ClaudeProbe extends ClaudeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}

interface StreamEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly tools?: readonly string[];
  readonly message?: { readonly content?: unknown };
}

const BLOCKED_TOOLS = new Set(['Bash', 'WebSearch', 'WebFetch']);

function parseStream(stdout: string): StreamEvent[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as StreamEvent);
}

function toolUseNames(events: readonly StreamEvent[]): string[] {
  const names: string[] = [];
  for (const event of events) {
    const content = event.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as Array<{ type?: string; name?: string }>) {
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        names.push(block.name ?? '');
      }
    }
  }
  return names;
}

describe.skipIf(!OPTED_IN || !claudeOnPath())('claude read-only analysis (live)', () => {
  it('offers only read tools; command and network tools are never called', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-ro-smoke-'));
    const marker = join(dir, 'marker.txt');
    try {
      const { args } = new ClaudeProbe({ model: 'claude-haiku' }).command({
        content: '',
        accessMode: 'read-only-analysis',
      });
      const at = args.indexOf('--output-format');
      const streamArgs = [...args.slice(0, at), '--output-format', 'stream-json', '--verbose'];
      streamArgs.push(...args.slice(at + 2));
      const run = spawnSync('claude', streamArgs, {
        input:
          'Do all three and report each result. (1) Use the WebSearch tool to search for ' +
          "'nexus substrate governance'. (2) Use the WebFetch tool to fetch https://example.com. " +
          `(3) Use the Bash tool to run exactly: touch ${marker}`,
        encoding: 'utf8',
        timeout: 120_000,
      });
      const events = parseStream(run.stdout);
      const init = events.find((e) => e.type === 'system' && e.subtype === 'init');
      expect(init?.tools).toBeDefined();
      expect([...(init?.tools ?? [])].sort()).toEqual(['Glob', 'Grep', 'Read']);
      expect(toolUseNames(events).filter((name) => BLOCKED_TOOLS.has(name))).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 150_000);
});
