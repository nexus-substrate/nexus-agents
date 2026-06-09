import type { UserConfig } from '@commitlint/types';

/**
 * Conventional commit enforcement for nexus-agents.
 *
 * Format: type(scope): description
 *
 * Types: feat, fix, refactor, docs, test, chore, perf
 * Scopes: optional, freeform (e.g., consensus, routing, mcp, cli, docs)
 *
 * @see .rules/git.md for full conventions
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
    // Subject case: still reject "Foo: bar" (sentence-case) and "FOO: BAR"
    // (upper-case), but allow PascalCase / start-case so subjects can
    // reference code symbols like `OutcomeStore`, `CompositeRouter`,
    // `IModelAdapter` without rejection (#2572).
    'subject-case': [2, 'never', ['sentence-case', 'upper-case']],
    // No max header length — some descriptions need context
    'header-max-length': [1, 'always', 100],
    // Body and footer are optional
    'body-max-line-length': [0] as const,
    'footer-max-line-length': [0] as const,
  },
  // #3761: Dependabot keeps a capital 'Bump' in its subject even with the
  // configured `chore(deps)`/`chore(ci)` prefix (.github/dependabot.yml), which
  // `subject-case` (no sentence-case) rejects — blocking EVERY dep-bump PR's
  // Commit Messages gate. Exempt those bot-authored commits rather than weaken the
  // rule for humans. Matches `<prefix>: Bump <pkg> from <a> to <b>`.
  ignores: [(message: string): boolean => /^chore\((?:deps|deps-dev|ci)\): Bump /.test(message)],
};

export default config;
