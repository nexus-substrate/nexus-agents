/**
 * nexus-agents/agents - Constitutional Critic Tests
 *
 * @module agents/collaboration/constitutional-critic.test
 * (Source: Issue #147)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConstitutionalCritic,
  createConstitutionalCritic,
  critiqueCode,
} from './constitutional-critic.js';
import { CODE_CONSTITUTION, getCriticalPrinciples } from './constitutions/code.js';

describe('ConstitutionalCritic', () => {
  let critic: ConstitutionalCritic;

  beforeEach(() => {
    critic = new ConstitutionalCritic({ verbose: false });
  });

  describe('constructor', () => {
    it('should create critic with default config', () => {
      const c = new ConstitutionalCritic();
      const config = c.getConfig();
      expect(config.maxIterations).toBe(3);
      expect(config.passingScore).toBe(7);
    });

    it('should accept custom config', () => {
      const c = new ConstitutionalCritic({ maxIterations: 5, passingScore: 8 });
      const config = c.getConfig();
      expect(config.maxIterations).toBe(5);
      expect(config.passingScore).toBe(8);
    });
  });

  describe('critique', () => {
    it('should find no violations in clean code', () => {
      const cleanCode = `
        function add(a: number, b: number): number {
          return a + b;
        }
      `;

      const result = critic.critique(cleanCode, CODE_CONSTITUTION);

      expect(result.violations.length).toBe(0);
      expect(result.passesConstitution).toBe(true);
      expect(result.overallScore).toBe(10);
    });

    it('should detect hardcoded secrets', () => {
      const codeWithSecret = `
        const API_KEY = "sk-TESTFAKE_000";
        fetch(url, { headers: { Authorization: API_KEY } });
      `;

      const result = critic.critique(codeWithSecret, CODE_CONSTITUTION);

      const secretViolation = result.violations.find((v) => v.principleId === 'no-secrets');
      expect(secretViolation).toBeDefined();
      expect(secretViolation?.severity).toBe('critical');
    });

    it('should detect console.log usage', () => {
      const codeWithConsole = `
        function process(data: Data) {
          console.log("Processing:", data);
          return transform(data);
        }
      `;

      const result = critic.critique(codeWithConsole, CODE_CONSTITUTION);

      const consoleViolation = result.violations.find((v) => v.principleId === 'no-console');
      expect(consoleViolation).toBeDefined();
      expect(consoleViolation?.severity).toBe('medium');
    });

    it('should detect type any usage', () => {
      const codeWithAny = `
        function process(data: any) {
          return data.value;
        }
      `;

      const result = critic.critique(codeWithAny, CODE_CONSTITUTION);

      const typeViolation = result.violations.find((v) => v.principleId === 'type-safety');
      expect(typeViolation).toBeDefined();
    });

    it('should detect eval usage', () => {
      const codeWithEval = `
        function calculate(expr: string) {
          return eval(expr);
        }
      `;

      const result = critic.critique(codeWithEval, CODE_CONSTITUTION);

      const evalViolation = result.violations.find((v) => v.principleId === 'no-eval');
      expect(evalViolation).toBeDefined();
      expect(evalViolation?.severity).toBe('critical');
    });

    it('should detect SQL injection vulnerability', () => {
      const sqlInjectionCode = `
        const query = \`SELECT * FROM users WHERE id = \${userId}\`;
        db.query(query);
      `;

      const result = critic.critique(sqlInjectionCode, CODE_CONSTITUTION);

      const sqlViolation = result.violations.find((v) => v.principleId === 'sql-injection');
      expect(sqlViolation).toBeDefined();
      expect(sqlViolation?.severity).toBe('critical');
    });

    it('should return score based on violations', () => {
      const badCode = `
        const API_KEY = "sk-secret";
        console.log(eval(input));
      `;

      const result = critic.critique(badCode, CODE_CONSTITUTION);

      expect(result.overallScore).toBeLessThan(10);
      expect(result.passesConstitution).toBe(false);
    });

    it('should filter by principle IDs', () => {
      const code = `
        const API_KEY = "sk-secret";
        console.log("hello");
      `;

      const result = critic.critique(code, CODE_CONSTITUTION, {
        principleIds: ['no-console'],
      });

      expect(result.violations.every((v) => v.principleId === 'no-console')).toBe(true);
    });
  });

  describe('revise', () => {
    it('should add fix annotations for violations', () => {
      const code = `line1
const API_KEY = "sk-abc123";
line3`;

      const critique = critic.critique(code, CODE_CONSTITUTION);
      const revised = critic.revise(code, critique);

      // Should have added TODO comments
      expect(revised).toContain('TODO');
    });

    it('should return unchanged output when no violations', () => {
      const cleanCode = 'const x = 1;';
      const critique = critic.critique(cleanCode, CODE_CONSTITUTION);
      const revised = critic.revise(cleanCode, critique);

      expect(revised).toBe(cleanCode);
    });
  });

  describe('refineWithConstitution', () => {
    it('should iterate until convergence or max', () => {
      const code = `
        const secret = "password123";
        console.log(secret);
      `;

      const result = critic.refineWithConstitution(code, CODE_CONSTITUTION);

      expect(result.iterations.length).toBeGreaterThan(0);
      expect(result.totalIterations).toBeLessThanOrEqual(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should stop early if already passing', () => {
      const cleanCode = `
        function safe(input: Input): Result<Output, Error> {
          const parsed = Schema.parse(input);
          return { ok: true, value: parsed };
        }
      `;

      const result = critic.refineWithConstitution(cleanCode, CODE_CONSTITUTION);

      expect(result.totalIterations).toBe(1);
      expect(result.converged).toBe(true);
    });

    it('should respect maxIterations option', () => {
      const badCode = `
        const key = "sk-secret";
        eval(input);
        console.log("debug");
      `;

      const result = critic.refineWithConstitution(badCode, CODE_CONSTITUTION, {
        maxIterations: 1,
      });

      expect(result.totalIterations).toBe(1);
    });
  });
});

describe('CODE_CONSTITUTION', () => {
  it('should have required principles', () => {
    expect(CODE_CONSTITUTION.principles.length).toBeGreaterThan(0);
    expect(CODE_CONSTITUTION.id).toBe('code-generation-v1');
  });

  it('should have critical security principles', () => {
    const criticalIds = getCriticalPrinciples();
    expect(criticalIds).toContain('no-secrets');
    expect(criticalIds).toContain('no-eval');
    expect(criticalIds).toContain('sql-injection');
  });

  it('should have examples for each principle', () => {
    for (const principle of CODE_CONSTITUTION.principles) {
      expect(principle.examples.length).toBeGreaterThan(0);
    }
  });
});

describe('createConstitutionalCritic', () => {
  it('should create critic instance', () => {
    const critic = createConstitutionalCritic();
    expect(critic).toBeInstanceOf(ConstitutionalCritic);
  });

  it('should accept custom config', () => {
    const critic = createConstitutionalCritic({ maxIterations: 10 });
    expect(critic.getConfig().maxIterations).toBe(10);
  });
});

describe('critiqueCode', () => {
  it('should return critique result', () => {
    const code = 'const x = 1;';
    const result = critiqueCode(code, CODE_CONSTITUTION);

    expect(result.constitutionId).toBe('code-generation-v1');
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});
