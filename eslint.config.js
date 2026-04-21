import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/coverage/**']),

  // Base TypeScript configuration
  {
    name: 'nexus-agents/typescript',
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Code structure limits (enforced)
      'max-lines': [
        'error',
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      'max-lines-per-function': [
        'error',
        { max: 50, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['error', 10],
      'max-params': ['error', 5],
      'max-depth': ['error', 4],

      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      // typescript-eslint 8.59.0 made this rule more aggressive; it produces
      // false positives when combined with `exactOptionalPropertyTypes`
      // (type assertions that look redundant to eslint are still required by
      // tsc to narrow union types). Keep as a warning for diagnostic value.
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

      // Best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files - relaxed rules
  {
    name: 'nexus-agents/tests',
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      'max-lines': 'off', // Test files can be longer for comprehensive coverage
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off', // Allow ! assertions in tests
      '@typescript-eslint/no-unnecessary-condition': 'off', // Allow optional chaining in tests
      '@typescript-eslint/unbound-method': 'off', // Allow mock method assertions
      '@typescript-eslint/no-unsafe-assignment': 'off', // Allow JSON.parse in tests
      '@typescript-eslint/no-unsafe-member-access': 'off', // Allow accessing parsed JSON
    },
  },
]);
