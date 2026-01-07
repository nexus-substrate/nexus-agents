/**
 * nexus-agents/testing/tasks/definitions - Task 008
 *
 * Task 008: API Documentation
 * Tests documentation generation ability.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 8: API Documentation
 * Tests documentation generation ability.
 */
export const TASK_008_DOCUMENTATION: EvaluationTask = {
  id: 'task-008',
  name: 'API Documentation',
  category: 'documentation',
  difficulty: 'easy',
  description: 'Generate comprehensive API documentation.',
  prompt: `Generate comprehensive API documentation for the following TypeScript interface:

\`\`\`typescript
interface IModelAdapter {
  readonly name: string;
  readonly capabilities: ModelCapability[];

  complete(request: CompletionRequest): Promise<Result<CompletionResponse, AdapterError>>;

  stream(request: CompletionRequest): AsyncGenerator<StreamChunk, void, unknown>;

  countTokens(text: string): Promise<number>;

  validateRequest(request: CompletionRequest): Result<void, ValidationError>;
}

interface CompletionRequest {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  tools?: ToolDefinition[];
}
\`\`\`

Include:
1. Overview of the interface purpose
2. Each method with:
   - Description
   - Parameters (name, type, description)
   - Return value
   - Possible errors
   - Example usage
3. Usage guidelines and best practices
4. Common error handling patterns`,
  expectedOutcome: {
    mustContain: ['@param', '@returns', 'Example', 'error'],
    mustNotContain: [],
    minLength: 600,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'completeness',
        description: 'All methods documented',
        weight: 0.3,
        maxScore: 10,
        indicators: ['complete', 'stream', 'countTokens', 'validateRequest'],
      },
      {
        id: 'clarity',
        description: 'Clear and understandable descriptions',
        weight: 0.25,
        maxScore: 10,
        indicators: ['@param', '@returns', 'description'],
      },
      {
        id: 'examples',
        description: 'Includes useful examples',
        weight: 0.25,
        maxScore: 10,
        indicators: ['example', '```', 'const'],
      },
      {
        id: 'error_handling',
        description: 'Documents error cases',
        weight: 0.2,
        maxScore: 10,
        indicators: ['error', 'throws', 'fail', 'Result'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 45000,
  optimalCli: 'codex',
  acceptableClis: ['codex', 'claude', 'gemini'],
  tags: ['documentation', 'api', 'jsdoc', 'technical-writing'],
};
