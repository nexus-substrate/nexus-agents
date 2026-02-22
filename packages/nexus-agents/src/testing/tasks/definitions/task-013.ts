/**
 * nexus-agents/testing/tasks/definitions - Task 013
 *
 * Task 013: Schema Migration
 * Tests database schema design skills.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 13: Schema Migration
 * Tests database schema design skills.
 */
export const TASK_013_SCHEMA_MIGRATION: EvaluationTask = {
  id: 'task-013',
  name: 'Schema Migration',
  category: 'code_generation',
  difficulty: 'medium',
  description: 'Design and implement database schema migrations.',
  prompt: `Design database migrations for evolving a user system schema:

Current Schema (v1):
\`\`\`sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

Target Schema (v3):
- Split name into first_name, last_name
- Add user roles (admin, user, guest)
- Add email verification (verified_at, verification_token)
- Add soft delete (deleted_at)
- Add profile with avatar_url, bio, timezone
- Add audit log for sensitive changes

Provide:
1. Migration v1 to v2 (add roles, email verification)
2. Migration v2 to v3 (split name, add profile, soft delete)
3. Rollback scripts for each migration
4. Data migration strategy (existing users)
5. Zero-downtime considerations

Use PostgreSQL syntax. Include TypeScript types for the final schema.`,
  expectedOutcome: {
    mustContain: ['ALTER TABLE', 'ADD COLUMN', 'DROP COLUMN', 'rollback'],
    mustNotContain: [],
    shouldContainCode: true,
    minLength: 600,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'migration_correctness',
        description: 'Migrations are syntactically correct',
        weight: 0.3,
        maxScore: 10,
        indicators: ['ALTER', 'ADD COLUMN', 'DROP', 'RENAME'],
      },
      {
        id: 'rollback',
        description: 'Rollback scripts provided',
        weight: 0.2,
        maxScore: 10,
        indicators: ['rollback', 'revert', 'undo'],
      },
      {
        id: 'data_migration',
        description: 'Data migration handled',
        weight: 0.25,
        maxScore: 10,
        indicators: ['UPDATE', 'SET', 'existing', 'default'],
      },
      {
        id: 'zero_downtime',
        description: 'Zero-downtime considerations',
        weight: 0.25,
        maxScore: 10,
        indicators: ['downtime', 'backwards compatible', 'deploy'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 6,
  },
  timeoutMs: 75000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'gemini', 'codex', 'opencode'],
  tags: ['database', 'migration', 'postgresql', 'schema'],
};
