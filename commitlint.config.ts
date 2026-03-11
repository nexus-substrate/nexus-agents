import type { UserConfig } from '@commitlint/types';

/**
 * Conventional commit enforcement for nexus-agents.
 *
 * Format: type(scope): description
 *
 * Types: feat, fix, refactor, docs, test, chore, perf
 * Scopes: optional, freeform (e.g., consensus, routing, mcp, cli, docs)
 *
 * @see .claude/rules/git.md for full conventions
 * @see https://www.conventionalcommits.org/en/v1.0.0/
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce the project's documented types only
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf']],
    // Subject must not be empty
    'subject-empty': [2, 'never'],
    // Type must not be empty
    'type-empty': [2, 'never'],
    // No max header length — some descriptions need context
    'header-max-length': [1, 'always', 100],
    // Body and footer are optional
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};

export default config;
