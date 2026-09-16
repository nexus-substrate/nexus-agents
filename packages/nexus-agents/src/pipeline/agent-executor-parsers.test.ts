/**
 * PM-response parsing (#6331): a numeric id is a common model output and must
 * survive as its string form; a non-string title must fall back rather than
 * stringify as `[object Object]`.
 */
import { describe, it, expect } from 'vitest';
import { parseTasksFromResponse } from './agent-executor-parsers.js';

describe('parseTasksFromResponse', () => {
  it('keeps a numeric id as its string form and falls back on a non-string title', () => {
    const tasks = parseTasksFromResponse('[{ "id": 1, "title": {} }]', 'fallback plan');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('1');
    expect(tasks[0]?.title).toBe('Task 1');
    expect(tasks[0]?.description).toBe('');
    expect(JSON.stringify(tasks)).not.toContain('[object Object]');
  });
});
