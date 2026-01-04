/**
 * nexus-agents/agents - SimpleAgent
 *
 * A simple concrete agent implementation for testing and basic use cases.
 */

import type { Result, Task, TaskResult, CompletionRequest, Message } from '../core/index.js';
import { ok, err, AgentError } from '../core/index.js';
import { BaseAgent } from './base-agent.js';

/**
 * Simple concrete agent implementation for testing and basic use cases.
 *
 * This agent processes tasks by sending them directly to the model adapter
 * and returning the response.
 */
export class SimpleAgent extends BaseAgent {
  /**
   * Execute a task by sending it to the model.
   */
  protected async executeTask(task: Task): Promise<Result<TaskResult, AgentError>> {
    const startTime = Date.now();
    const messages = this.buildPrompt(task);

    // Build request, only including defined optional properties
    const request: CompletionRequest = {
      messages,
      temperature: this.temperature,
      maxTokens: task.constraints?.maxTokens ?? this.maxTokens,
    };
    if (this.systemPrompt !== undefined) {
      request.systemPrompt = this.systemPrompt;
    }

    const result = await this.complete(request);
    if (!result.ok) {
      return err(result.error);
    }

    const durationMs = Date.now() - startTime;

    // Extract text content from response
    const textContent = result.value.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return ok({
      taskId: task.id,
      output: textContent,
      metadata: {
        durationMs,
        tokensUsed: result.value.usage.totalTokens,
        toolsUsed: [],
        model: result.value.model,
      },
    });
  }

  /**
   * Build prompt messages from a task.
   */
  protected buildPrompt(task: Task): Message[] {
    const messages: Message[] = [];

    // Add history from task context
    if (task.context.history !== undefined) {
      for (const item of task.context.history) {
        if (item.role === 'user' || item.role === 'assistant') {
          messages.push({
            role: item.role,
            content: item.content,
          });
        }
      }
    }

    // Add the task description as the user message
    messages.push({
      role: 'user',
      content: task.description,
    });

    return messages;
  }
}
