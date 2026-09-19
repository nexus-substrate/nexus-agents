/**
 * Tests for core/index barrel re-exports (#5129 item 6).
 *
 * Verifies that core/index.ts explicitly re-exports canonical types and values
 * from core/types/ without wildcard `export *`, avoiding silent shadowing
 * of types like ToolResult across the codebase.
 *
 * @module core/index.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ModelCapability,
  AgentCapability,
  ParseError,
  ToolError,
  OrchestratorError,
  PruneStrategyName,
  isRegistryItem,
  type ToolResult,
  type ToolContentBlock,
  type ToolInfo,
  type Task,
  type TaskResult,
  type ExecutionStatus,
  type PruneDecision,
} from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('core/index re-exports (#5129 item 6)', () => {
  it('does not contain wildcard re-export from types', () => {
    const indexPath = join(__dirname, 'index.ts');
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).not.toMatch(/export\s+\*\s+from\s+['"]\.\/types/);
  });

  describe('re-exported runtime values', () => {
    it('exports ModelCapability with expected capabilities', () => {
      expect(ModelCapability).toBeDefined();
      expect(ModelCapability.COMPLETION).toBe('completion');
      expect(ModelCapability.TOOL_USE).toBe('tool_use');
    });

    it('exports AgentCapability with expected capabilities', () => {
      expect(AgentCapability).toBeDefined();
      expect(AgentCapability.TASK_EXECUTION).toBe('task_execution');
      expect(AgentCapability.TOOL_USE).toBe('tool_use');
    });

    it('exports PruneStrategyName with expected strategies', () => {
      expect(PruneStrategyName).toBeDefined();
      expect(PruneStrategyName.OLDEST_FIRST).toBe('oldest_first');
      expect(PruneStrategyName.SLIDING_WINDOW).toBe('sliding_window');
    });

    it('exports ToolError class that constructs with toolName', () => {
      const err = new ToolError('Failed to execute', 'test_tool', { foo: 'bar' });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ToolError);
      expect(err.name).toBe('ToolError');
      expect(err.toolName).toBe('test_tool');
      expect(err.input).toEqual({ foo: 'bar' });
    });

    it('exports ParseError class', () => {
      const err = new ParseError('Invalid syntax', { line: 10, column: 5 });
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ParseError);
      expect(err.name).toBe('ParseError');
      expect(err.line).toBe(10);
      expect(err.column).toBe(5);
    });

    it('exports OrchestratorError class', () => {
      const err = new OrchestratorError('Orchestration failed', 'ORCHESTRATOR_STEP_FAILED');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OrchestratorError);
      expect(err.code).toBe('ORCHESTRATOR_STEP_FAILED');
    });

    it('exports isRegistryItem predicate', () => {
      expect(typeof isRegistryItem).toBe('function');
      expect(isRegistryItem({ id: 'item-1', name: 'test' })).toBe(true);
      expect(isRegistryItem(null)).toBe(false);
      expect(isRegistryItem({})).toBe(false);
    });
  });

  describe('type-level contracts', () => {
    it('satisfies ToolResult shape', () => {
      const res: ToolResult = {
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        structuredContent: { count: 1 },
      };
      expect(res.content).toHaveLength(1);
    });

    it('satisfies ToolContentBlock shape', () => {
      const block: ToolContentBlock = { type: 'text', text: 'hello' };
      expect(block.type).toBe('text');
    });

    it('satisfies ToolInfo shape', () => {
      const info: ToolInfo = {
        name: 'test_tool',
        description: 'a test tool',
        inputSchema: { type: 'object' },
      };
      expect(info.name).toBe('test_tool');
    });

    it('satisfies Task and TaskResult shapes', () => {
      const task: Task = {
        id: 'task-1',
        description: 'run a task',
      };
      const result: TaskResult = {
        taskId: task.id,
        success: true,
        output: 'done',
      };
      expect(result.success).toBe(true);
    });

    it('satisfies ExecutionStatus and PruneDecision shapes', () => {
      const status: ExecutionStatus = 'completed';
      const decision: PruneDecision = {
        shouldPrune: true,
        reason: 'old',
        score: 0.1,
      };
      expect(status).toBe('completed');
      expect(decision.shouldPrune).toBe(true);
    });
  });
});
