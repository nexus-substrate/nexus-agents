/**
 * nexus-agents/agents - SimpleAgent
 *
 * A simple concrete agent implementation for testing and basic use cases.
 */

import type { Result, Task, TaskResult, CompletionRequest, Message } from '../core/index.js';
import { ok, err, AgentError, getTimeProvider } from '../core/index.js';
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
    const startTime = getTimeProvider().now();
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

    const durationMs = getTimeProvider().now() - startTime;

    // Extract text content from response
    const textContent = result.value.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Guard: treat responses with no text and no tool calls as empty (#1521)
    // Retry once — empty responses are often transient (#1528)
    const hasToolUse = result.value.content.some((b) => b.type === 'tool_use');
    if (textContent.trim() === '' && !hasToolUse) {
      return this.retryOnEmpty(request, task, startTime);
    }

    return ok({
      taskId: task.id,
      output: textContent,
      metadata: {
        durationMs,
        tokensUsed: result.value.usage?.totalTokens ?? 0,
        toolsUsed: [],
        model: result.value.model,
      },
    });
  }

  /** Retry once on empty response — returns success if retry has content, error otherwise. */
  private async retryOnEmpty(
    request: CompletionRequest,
    task: Task,
    startTime: number
  ): Promise<Result<TaskResult, AgentError>> {
    const retry = await this.complete(request);
    if (!retry.ok) return err(retry.error);
    const text = retry.value.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const hasTools = retry.value.content.some((b) => b.type === 'tool_use');
    if (text.trim() === '' && !hasTools) {
      return err(
        new AgentError('Model returned empty response', {
          context: { taskId: task.id, model: retry.value.model },
        })
      );
    }
    const durationMs = getTimeProvider().now() - startTime;
    return ok({
      taskId: task.id,
      output: text,
      metadata: {
        durationMs,
        tokensUsed: retry.value.usage?.totalTokens ?? 0,
        toolsUsed: [],
        model: retry.value.model,
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
