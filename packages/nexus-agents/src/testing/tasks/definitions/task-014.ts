/**
 * nexus-agents/testing/tasks/definitions - Task 014
 *
 * Task 014: Security Code Review
 * Tests security awareness and code review skills.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 14: Security Code Review
 * Tests security awareness and code review skills.
 */
export const TASK_014_SECURITY_REVIEW: EvaluationTask = {
  id: 'task-014',
  name: 'Security Code Review',
  category: 'debugging',
  difficulty: 'hard',
  description: 'Identify security vulnerabilities in code.',
  prompt: `Review the following Express.js API code for security vulnerabilities:

\`\`\`typescript
import express from 'express';
import { query } from './database';

const app = express();
app.use(express.json());

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await query(
    \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`
  );
  if (result.rows.length > 0) {
    const token = Buffer.from(JSON.stringify({
      userId: result.rows[0].id,
      admin: result.rows[0].is_admin
    })).toString('base64');
    res.cookie('auth', token);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Get user profile
app.get('/profile', async (req, res) => {
  const token = req.cookies.auth;
  const user = JSON.parse(Buffer.from(token, 'base64').toString());
  const result = await query(\`SELECT * FROM users WHERE id = \${user.userId}\`);
  res.json(result.rows[0]);
});

// Update profile
app.put('/profile', async (req, res) => {
  const token = req.cookies.auth;
  const user = JSON.parse(Buffer.from(token, 'base64').toString());
  const { name, email } = req.body;
  await query(
    \`UPDATE users SET name = '\${name}', email = '\${email}' WHERE id = \${user.userId}\`
  );
  res.json({ success: true });
});

// File upload
app.post('/upload', async (req, res) => {
  const { filename, content } = req.body;
  const fs = require('fs');
  fs.writeFileSync(\`./uploads/\${filename}\`, content);
  res.json({ path: \`/uploads/\${filename}\` });
});

// Admin endpoint
app.get('/admin/users', async (req, res) => {
  const token = req.cookies.auth;
  const user = JSON.parse(Buffer.from(token, 'base64').toString());
  if (user.admin) {
    const result = await query('SELECT * FROM users');
    res.json(result.rows);
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});
\`\`\`

Identify ALL security vulnerabilities, explain the risk, and provide secure alternatives.
Categorize by severity: Critical, High, Medium, Low.`,
  expectedOutcome: {
    mustContain: ['SQL injection', 'path traversal', 'XSS', 'authentication'],
    mustNotContain: [],
    minLength: 800,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'vulnerability_detection',
        description: 'All major vulnerabilities identified',
        weight: 0.4,
        maxScore: 10,
        indicators: ['SQL injection', 'path traversal', 'token', 'CSRF'],
      },
      {
        id: 'severity_assessment',
        description: 'Correct severity ratings',
        weight: 0.2,
        maxScore: 10,
        indicators: ['Critical', 'High', 'Medium', 'severity'],
      },
      {
        id: 'fix_quality',
        description: 'Secure fix recommendations',
        weight: 0.3,
        maxScore: 10,
        indicators: ['parameterized', 'JWT', 'sanitize', 'validate'],
      },
      {
        id: 'explanation',
        description: 'Clear risk explanations',
        weight: 0.1,
        maxScore: 10,
        indicators: ['attacker', 'exploit', 'risk', 'impact'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 7,
    notes: 'Critical security task - high passing score required',
  },
  timeoutMs: 90000,
  optimalCli: 'claude',
  acceptableClis: ['claude', 'gemini'],
  tags: ['security', 'code-review', 'owasp', 'critical'],
};
