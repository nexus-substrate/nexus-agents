/**
 * Tests for MCP Prompt Definitions
 *
 * Verifies prompt template data, argument schemas, and message builders.
 *
 * @module mcp/prompts/prompt-definitions.test
 */
import { describe, it, expect } from 'vitest';

import { PROMPT_DEFINITIONS } from './prompt-definitions.js';

// ============================================================================
// Prompt registry
// ============================================================================

describe('PROMPT_DEFINITIONS', () => {
  it('contains exactly 4 prompt definitions', () => {
    expect(PROMPT_DEFINITIONS).toHaveLength(4);
  });

  it('has unique names', () => {
    const names = PROMPT_DEFINITIONS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('includes all expected prompts', () => {
    const names = PROMPT_DEFINITIONS.map((p) => p.name);
    expect(names).toContain('orchestrate-task');
    expect(names).toContain('security-review');
    expect(names).toContain('code-review');
    expect(names).toContain('research-survey');
  });

  it('every definition has a non-empty description', () => {
    for (const def of PROMPT_DEFINITIONS) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('every definition has at least one arg in its schema', () => {
    for (const def of PROMPT_DEFINITIONS) {
      expect(Object.keys(def.argsSchema).length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// orchestrate-task prompt
// ============================================================================

describe('orchestrate-task prompt', () => {
  const def = PROMPT_DEFINITIONS.find((p) => p.name === 'orchestrate-task')!;

  it('requires task arg', () => {
    expect(def.argsSchema).toHaveProperty('task');
  });

  it('has optional engine arg', () => {
    expect(def.argsSchema).toHaveProperty('engine');
  });

  it('builds 2 messages with required args', () => {
    const msgs = def.buildMessages({ task: 'deploy the app' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[1]!.role).toBe('user');
    expect(msgs[1]!.content.text).toContain('deploy the app');
  });

  it('includes engine when provided', () => {
    const msgs = def.buildMessages({ task: 'test', engine: 'claude' });
    const systemText = msgs[0]!.content.text;
    expect(systemText).toContain('claude');
  });

  it('omits engine note when engine is empty', () => {
    const msgsUndefined = def.buildMessages({ task: 'test' });
    const msgsEmpty = def.buildMessages({ task: 'test', engine: '' });
    // Neither should contain "Preferred engine"
    expect(msgsUndefined[0]!.content.text).not.toContain('Preferred engine');
    expect(msgsEmpty[0]!.content.text).not.toContain('Preferred engine');
  });
});

// ============================================================================
// security-review prompt
// ============================================================================

describe('security-review prompt', () => {
  const def = PROMPT_DEFINITIONS.find((p) => p.name === 'security-review')!;

  it('requires target arg', () => {
    expect(def.argsSchema).toHaveProperty('target');
  });

  it('builds messages mentioning the target', () => {
    const msgs = def.buildMessages({ target: 'src/auth.ts' });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.content.text).toContain('src/auth.ts');
  });

  it('mentions severity classification in instructions', () => {
    const msgs = def.buildMessages({ target: 'x' });
    expect(msgs[0]!.content.text).toContain('severity');
  });
});

// ============================================================================
// code-review prompt
// ============================================================================

describe('code-review prompt', () => {
  const def = PROMPT_DEFINITIONS.find((p) => p.name === 'code-review')!;

  it('requires target arg', () => {
    expect(def.argsSchema).toHaveProperty('target');
  });

  it('builds messages with code review checklist', () => {
    const msgs = def.buildMessages({ target: 'PR #42' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0]!.content.text).toContain('error handling');
    expect(msgs[1]!.content.text).toContain('PR #42');
  });
});

// ============================================================================
// research-survey prompt
// ============================================================================

describe('research-survey prompt', () => {
  const def = PROMPT_DEFINITIONS.find((p) => p.name === 'research-survey')!;

  it('requires topic arg', () => {
    expect(def.argsSchema).toHaveProperty('topic');
  });

  it('has optional maxResults arg', () => {
    expect(def.argsSchema).toHaveProperty('maxResults');
  });

  it('builds messages with topic', () => {
    const msgs = def.buildMessages({ topic: 'multi-agent systems' });
    expect(msgs).toHaveLength(2);
    expect(msgs[1]!.content.text).toContain('multi-agent systems');
  });

  it('includes maxResults when provided', () => {
    const msgs = def.buildMessages({ topic: 'test', maxResults: '5' });
    expect(msgs[0]!.content.text).toContain('5');
  });

  it('omits maxResults note when not provided', () => {
    const msgs = def.buildMessages({ topic: 'test' });
    expect(msgs[0]!.content.text).not.toContain('Return at most');
  });
});

// ============================================================================
// Message structure validation
// ============================================================================

describe('all prompt messages', () => {
  it('have valid message structure', () => {
    for (const def of PROMPT_DEFINITIONS) {
      const msgs = def.buildMessages({ task: 'x', target: 'x', topic: 'x' });
      for (const msg of msgs) {
        expect(['user', 'assistant']).toContain(msg.role);
        expect(msg.content.type).toBe('text');
        expect(typeof msg.content.text).toBe('string');
        expect(msg.content.text.length).toBeGreaterThan(0);
      }
    }
  });
});
