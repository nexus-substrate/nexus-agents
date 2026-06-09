/**
 * Fixture tests for the AST-based MCP tool-manifest parser (#3596).
 *
 * Replaces the brittle regex that inject-governance.ts used to scrape tool names
 * from a literal. These assert the AST parser reads names in source order, honors
 * the TOOL_MANIFEST > REGISTERED_TOOL_NAMES > legacy `tools:` priority, and
 * survives shapes a line-oriented regex could not (comments between elements,
 * double quotes, single-line arrays).
 *
 * @module scripts/parse-tool-manifest.test
 */

import { describe, it, expect } from 'vitest';
import { parseRegisteredToolNames } from './parse-tool-manifest.js';

describe('parseRegisteredToolNames', () => {
  it('extracts TOOL_MANIFEST names in source order', () => {
    const src = `export const TOOL_MANIFEST = [\n  'orchestrate',\n  'run',\n  'vote',\n] as const;\n`;
    expect(parseRegisteredToolNames(src)).toEqual(['orchestrate', 'run', 'vote']);
  });

  it('reflects add/remove of a tool (the acceptance signal)', () => {
    const before = `const TOOL_MANIFEST = ['a', 'b'] as const;`;
    const after = `const TOOL_MANIFEST = ['a', 'b', 'c'] as const;`;
    expect(parseRegisteredToolNames(before)).toEqual(['a', 'b']);
    expect(parseRegisteredToolNames(after)).toEqual(['a', 'b', 'c']);
    const removed = `const TOOL_MANIFEST = ['b'] as const;`;
    expect(parseRegisteredToolNames(removed)).toEqual(['b']);
  });

  it('falls back to REGISTERED_TOOL_NAMES when TOOL_MANIFEST is absent', () => {
    const src = `export const REGISTERED_TOOL_NAMES = ['x', 'y'] as const;`;
    expect(parseRegisteredToolNames(src)).toEqual(['x', 'y']);
  });

  it('prefers TOOL_MANIFEST over REGISTERED_TOOL_NAMES when both are literals', () => {
    const src = `
      export const REGISTERED_TOOL_NAMES = ['old'] as const;
      export const TOOL_MANIFEST = ['new1', 'new2'] as const;
    `;
    expect(parseRegisteredToolNames(src)).toEqual(['new1', 'new2']);
  });

  it('handles the legacy inline `tools: [...]` property shape', () => {
    const src = `function registerTools() { return { tools: ['legacy1', 'legacy2'] }; }`;
    expect(parseRegisteredToolNames(src)).toEqual(['legacy1', 'legacy2']);
  });

  it('survives comments between elements (regex-fragile case)', () => {
    const src = `const TOOL_MANIFEST = [\n  'a', // first\n  // a note\n  'b',\n] as const;`;
    expect(parseRegisteredToolNames(src)).toEqual(['a', 'b']);
  });

  it('handles double-quoted and single-line arrays', () => {
    expect(parseRegisteredToolNames(`const TOOL_MANIFEST = ["a", "b", 'c'] as const;`)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns [] when no recognizable tool array is present', () => {
    expect(parseRegisteredToolNames(`export const SOMETHING_ELSE = 42;`)).toEqual([]);
    expect(parseRegisteredToolNames(``)).toEqual([]);
  });

  it('ignores a REGISTERED_TOOL_NAMES that is a reference, not a literal', () => {
    // Post-#3566 `index.ts` shape: `REGISTERED_TOOL_NAMES = TOOL_MANIFEST;`. With
    // no array literal anywhere, there is nothing to extract.
    expect(parseRegisteredToolNames(`export const REGISTERED_TOOL_NAMES = TOOL_MANIFEST;`)).toEqual(
      []
    );
  });
});
