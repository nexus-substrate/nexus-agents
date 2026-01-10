/**
 * Shared Utilities for Phase Executors
 *
 * Common helpers used across multiple phases.
 *
 * @module workflows/self-development/phases/shared
 */

import type { IAgent, Task, AgentMessage, AgentContext } from '../../../core/index.js';
import { ok, AgentCapability } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';

/**
 * Create a simple agent wrapper for use with protocols.
 * This bridges the IModelAdapter to IAgent interface.
 */
export function createSimpleAgent(
  deps: SelfDevWorkflowDependencies,
  agentId: string,
  role: string
): IAgent {
  return {
    id: agentId,
    role: role as IAgent['role'],
    state: 'idle',
    capabilities: [AgentCapability.TASK_EXECUTION],
    async execute(task: Task) {
      const response = await deps.modelAdapter.complete({
        messages: [{ role: 'user', content: task.description }],
        systemPrompt: `You are a ${role} agent.`,
      });
      if (!response.ok) {
        return { ok: false as const, error: response.error };
      }
      const content = response.value.content[0];
      const output = content?.type === 'text' ? content.text : '';
      return {
        ok: true as const,
        value: {
          taskId: task.id,
          output,
          metadata: {
            durationMs: 0,
            tokensUsed: response.value.usage.totalTokens,
            toolsUsed: [],
            model: 'self-dev',
          },
        },
      };
    },
    handleMessage(_msg: AgentMessage) {
      return Promise.resolve(ok({ messageId: 'msg-0', status: 'completed' as const }));
    },
    initialize(_ctx: AgentContext) {
      return Promise.resolve(ok(undefined));
    },
    cleanup() {
      return Promise.resolve();
    },
  };
}
