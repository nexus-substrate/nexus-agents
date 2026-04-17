/**
 * Tests for Claude Code permissions snippet generator (#1945).
 */
import { describe, it, expect } from 'vitest';
import { generatePermissionsSnippet, buildPermissionsBanner } from './setup-permissions.js';

describe('generatePermissionsSnippet', () => {
  it('generates readonly snippet with only safe read tools', () => {
    const snippet = generatePermissionsSnippet('readonly');
    const parsed = JSON.parse(snippet) as string[];
    expect(parsed.every((p) => p.startsWith('mcp__nexus-agents__'))).toBe(true);
    // Should NOT contain execution tools
    expect(parsed).not.toContain('mcp__nexus-agents__orchestrate');
    expect(parsed).not.toContain('mcp__nexus-agents__create_expert');
    // Should contain read-only tools
    expect(parsed).toContain('mcp__nexus-agents__list_experts');
    expect(parsed).toContain('mcp__nexus-agents__weather_report');
    expect(parsed).toContain('mcp__nexus-agents__memory_query');
  });

  it('generates all snippet with execution + read tools', () => {
    const snippet = generatePermissionsSnippet('all');
    const parsed = JSON.parse(snippet) as string[];
    expect(parsed).toContain('mcp__nexus-agents__orchestrate');
    expect(parsed).toContain('mcp__nexus-agents__create_expert');
    expect(parsed).toContain('mcp__nexus-agents__consensus_vote');
    expect(parsed).toContain('mcp__nexus-agents__list_experts');
  });

  it('defaults to all level', () => {
    const snippet = generatePermissionsSnippet();
    const parsed = JSON.parse(snippet) as string[];
    expect(parsed).toContain('mcp__nexus-agents__orchestrate');
  });

  it('returns entries sorted alphabetically', () => {
    const snippet = generatePermissionsSnippet();
    const parsed = JSON.parse(snippet) as string[];
    const sorted: string[] = [...parsed].sort((a, b) => a.localeCompare(b));
    expect(parsed).toEqual(sorted);
  });

  it('produces valid JSON array of strings', () => {
    const snippet = generatePermissionsSnippet();
    const parse = (): unknown => JSON.parse(snippet) as unknown;
    expect(parse).not.toThrow();
    const parsed = parse();
    expect(Array.isArray(parsed)).toBe(true);
  });
});

describe('buildPermissionsBanner', () => {
  it('wraps snippet with explanatory text', () => {
    const snippet = generatePermissionsSnippet('readonly');
    const banner = buildPermissionsBanner(snippet);
    expect(banner).toContain("'don't ask' mode");
    expect(banner).toContain('permissions.allow');
    expect(banner).toContain('~/.claude/settings.json');
    expect(banner).toContain(snippet);
    expect(banner).toContain('1945');
  });
});
