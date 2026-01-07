/**
 * nexus-agents/testing/tasks/definitions - Task 011
 *
 * Task 011: API Endpoint Design
 * Tests REST API design skills.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 11: API Endpoint Design
 * Tests REST API design skills.
 */
export const TASK_011_API_DESIGN: EvaluationTask = {
  id: 'task-011',
  name: 'API Endpoint Design',
  category: 'architecture',
  difficulty: 'medium',
  description: 'Design RESTful API endpoints.',
  prompt: `Design a RESTful API for a task management system with the following requirements:

Domain:
- Users can create, update, delete tasks
- Tasks belong to projects
- Tasks can have subtasks (one level deep)
- Tasks have status: todo, in_progress, done
- Tasks can be assigned to users
- Tasks have due dates and priorities (1-5)
- Users can comment on tasks
- Tasks can have tags (many-to-many)

Design:
1. Resource endpoints (URL patterns)
2. HTTP methods for each operation
3. Request/response bodies (TypeScript interfaces)
4. Query parameters for filtering/pagination
5. Error response format
6. Authentication approach (just describe, don't implement)

Follow REST best practices:
- Use nouns for resources
- Proper HTTP status codes
- Consistent naming conventions
- Support filtering, sorting, pagination
- HATEOAS considerations`,
  expectedOutcome: {
    mustContain: ['GET', 'POST', 'PUT', 'DELETE', '/tasks', '/projects'],
    mustNotContain: [],
    minLength: 800,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'rest_compliance',
        description: 'Follows REST best practices',
        weight: 0.3,
        maxScore: 10,
        indicators: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
      {
        id: 'completeness',
        description: 'All required operations covered',
        weight: 0.25,
        maxScore: 10,
        indicators: ['/tasks', '/projects', '/comments', '/subtasks'],
      },
      {
        id: 'types',
        description: 'Clear request/response types',
        weight: 0.25,
        maxScore: 10,
        indicators: ['interface', 'Request', 'Response'],
      },
      {
        id: 'pagination',
        description: 'Proper filtering and pagination',
        weight: 0.2,
        maxScore: 10,
        indicators: ['limit', 'offset', 'filter', 'sort'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 75000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'gemini', 'codex'],
  tags: ['api-design', 'rest', 'architecture', 'crud'],
};
