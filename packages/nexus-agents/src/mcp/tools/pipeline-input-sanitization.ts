/** Sanitizer observations shared by the pipeline MCP entry points (#4733). */
import type { AgentExecutorConfig } from '../../pipeline/agent-executor.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

/** Record whether the handler's sanitizer changed input, retaining counts when it did. */
export function measureInputSanitization(
  ctx?: HandlerContext
): Pick<AgentExecutorConfig, 'inputSanitization' | 'inputSanitizationCounts'> {
  const observation = ctx?.sanitization;
  // No handler context means no observation, never an unmodified measurement.
  if (observation === undefined) return { inputSanitization: 'unmeasured' };
  const { wasModified, tagsRemoved, commentsRemoved, fieldsModified } = observation;
  if (!wasModified && tagsRemoved === 0 && commentsRemoved === 0) {
    return { inputSanitization: 'unmodified' };
  }
  return {
    inputSanitization: 'modified',
    inputSanitizationCounts: { tagsRemoved, commentsRemoved, fieldsModified },
  };
}
