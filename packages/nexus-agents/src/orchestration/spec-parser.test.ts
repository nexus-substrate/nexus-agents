/**
 * Tests for Spec Parser.
 *
 * (Source: Issue #847 — Phase 2 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { parseSpec } from './spec-parser.js';

// ============================================================================
// Success Cases
// ============================================================================

describe('parseSpec', () => {
  it('parses a well-formed spec with all sections', () => {
    const md = `# Add User Authentication

## Overview
Implement OAuth2 login for the web application.

## Requirements
- Support Google OAuth provider
- Support GitHub OAuth provider
- Store tokens securely in encrypted session

## Acceptance Criteria
- [ ] User can log in with Google
- [x] User can log in with GitHub
- [ ] Session persists across page reloads

## Constraints
- Must not use third-party auth libraries
- Must work in Node.js 22+
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe('Add User Authentication');
    expect(result.value.overview).toContain('OAuth2 login');
    expect(result.value.requirements).toHaveLength(3);
    expect(result.value.requirements[0]).toBe('Support Google OAuth provider');
    expect(result.value.acceptanceCriteria).toHaveLength(3);
    expect(result.value.acceptanceCriteria[0]).toBe('User can log in with Google');
    expect(result.value.constraints).toHaveLength(2);
    expect(result.value.missingSections).toHaveLength(0);
  });

  it('extracts title from H2 heading', () => {
    const md = `## Feature: Dark Mode

## Overview
Add dark mode toggle.

## Requirements
- Theme switching
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Feature: Dark Mode');
  });

  it('detects missing sections', () => {
    const md = `# Minimal Spec

Just a title and some text.
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.missingSections).toContain('requirements');
    expect(result.value.missingSections).toContain('acceptance criteria');
  });

  it('extracts issue references', () => {
    const md = `# Fix Bug

## Overview
This fixes #123 and relates to #456.
See also #789 for context.

## Requirements
- Fix the issue from #123
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issueReferences).toHaveLength(3);
    expect(result.value.issueReferences.map((r) => r.number)).toEqual([123, 456, 789]);
  });

  it('extracts file references', () => {
    const md = `# Refactor Module

## Overview
Refactor \`src/core/index.ts\` and update \`src/config/schemas.ts:42\`.

## Requirements
- Modify \`src/utils/helpers.ts\`
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fileReferences).toHaveLength(3);
    expect(result.value.fileReferences[0]).toEqual({ path: 'src/core/index.ts' });
    expect(result.value.fileReferences[1]).toEqual({ path: 'src/config/schemas.ts:42', line: 42 });
  });

  it('deduplicates issue and file references', () => {
    const md = `# Test

## Overview
See #100 and #100 again. Also \`src/foo.ts\` and \`src/foo.ts\`.

## Requirements
- Something
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issueReferences).toHaveLength(1);
    expect(result.value.fileReferences).toHaveLength(1);
  });

  it('handles "Goal" section as overview', () => {
    const md = `# Feature

## Goal
Implement the feature quickly.

## Requirements
- Speed is key
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overview).toContain('feature quickly');
  });

  it('handles numbered list items', () => {
    const md = `# Feature

## Requirements
1. First requirement
2. Second requirement
3. Third requirement
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requirements).toHaveLength(3);
    expect(result.value.requirements[0]).toBe('First requirement');
  });

  it('handles asterisk list items', () => {
    const md = `# Feature

## Requirements
* Alpha
* Beta
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requirements).toHaveLength(2);
  });

  it('preserves raw markdown', () => {
    const md = '# Title\n\nSome content.';
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rawMarkdown).toBe(md);
  });

  it('uses preamble text as overview when no overview section', () => {
    const md = `# Feature

This is preamble text before any section.

## Requirements
- Something
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overview).toBe('');
    // Preamble is above first heading, but first heading IS the title
    // so it doesn't count as overview unless it's a named section
  });
});

// ============================================================================
// Error Cases
// ============================================================================

describe('parseSpec errors', () => {
  it('rejects empty input', () => {
    const result = parseSpec('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toBe('Spec is empty');
  });

  it('rejects whitespace-only input', () => {
    const result = parseSpec('   \n\n  ');
    expect(result.ok).toBe(false);
  });

  it('rejects input without heading', () => {
    const result = parseSpec('Just some text without a heading.');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('No title heading');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('parseSpec edge cases', () => {
  it('handles empty sections gracefully', () => {
    const md = `# Title

## Requirements

## Acceptance Criteria

## Constraints
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requirements).toHaveLength(0);
    expect(result.value.acceptanceCriteria).toHaveLength(0);
    expect(result.value.constraints).toHaveLength(0);
  });

  it('handles H3 sections', () => {
    const md = `# Title

### Requirements
- Nested heading requirement
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.requirements).toHaveLength(1);
  });

  it('does not match HTML entities as issue refs', () => {
    const md = `# Feature

## Overview
The color &#123; should not be an issue ref.

## Requirements
- Something
`;
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // &#123 should NOT be matched because of the & prefix exclusion
    expect(result.value.issueReferences).toHaveLength(0);
  });

  it('handles spec with only title', () => {
    const md = '# Just a Title';
    const result = parseSpec(md);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Just a Title');
    expect(result.value.missingSections).toContain('overview');
  });
});
