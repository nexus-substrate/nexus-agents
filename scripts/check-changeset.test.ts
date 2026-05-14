/**
 * Tests for the changeset-presence gate.
 *
 * @module scripts/check-changeset.test
 */

import { describe, it, expect } from 'vitest';
import { classifyChange } from './check-changeset.js';

describe('classifyChange', () => {
  it('flags shippable source with no changeset', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.ts',
      'docs/README.md',
    ]);
    expect(result.shippable).toEqual(['packages/nexus-agents/src/mcp/error-envelope.ts']);
    expect(result.hasChangeset).toBe(false);
  });

  it('passes when a changeset accompanies shippable source', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.ts',
      '.changeset/some-change.md',
    ]);
    expect(result.shippable).toHaveLength(1);
    expect(result.hasChangeset).toBe(true);
  });

  it('does not require a changeset for test-only changes', () => {
    const result = classifyChange([
      'packages/nexus-agents/src/mcp/error-envelope.test.ts',
      'packages/nexus-agents/src/mcp/__tests__/foo.ts',
    ]);
    expect(result.shippable).toHaveLength(0);
  });

  it('does not require a changeset for .d.ts-only changes', () => {
    const result = classifyChange(['packages/nexus-agents/src/types/global.d.ts']);
    expect(result.shippable).toHaveLength(0);
  });

  it('does not require a changeset for non-src changes (docs, scripts, workflows)', () => {
    const result = classifyChange([
      'docs/README.md',
      'scripts/check-changeset.ts',
      '.github/workflows/ci.yml',
      'packages/nexus-agents/package.json',
    ]);
    expect(result.shippable).toHaveLength(0);
  });

  it('ignores the changeset README as a changeset', () => {
    const result = classifyChange(['packages/nexus-agents/src/index.ts', '.changeset/README.md']);
    expect(result.hasChangeset).toBe(false);
  });
});
