import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/coverage/**']),

  // JSDoc accuracy (epic #3516, Phase 1 #3517). WARN-FIRST and accuracy-only:
  // these `check-*` rules fire only when a JSDoc block EXISTS and is
  // structurally wrong (param names that don't match the signature, undefined
  // or malformed types, typo'd tags) — they do NOT require docs on every
  // symbol. Coverage rules (`require-param`/`require-returns`) are deliberately
  // deferred (#3518) so this stays an accuracy baseline, not a CI wall. Tests
  // are excluded — JSDoc accuracy on the shipped/public surface is the target.
  {
    name: 'nexus-agents/jsdoc-accuracy',
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.spec.ts', '**/test/**', '**/__tests__/**'],
    plugins: { jsdoc },
    rules: {
      // ERROR (baseline clean as of #3518): these fire only on existing-but-wrong
      // JSDoc and are now at zero across non-test source, so they gate going
      // forward. checkDestructured:false keeps check-param-names focused on
      // genuine name mismatches rather than demanding a @param line for every
      // nested destructured property (coverage — a separate decision, #3518).
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/check-property-names': 'error',
      'jsdoc/check-types': 'error',
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/valid-types': 'error',
      // WARN: 10 remaining violations (mostly @link-style references); fixed in a
      // follow-up, then promoted to error.
      'jsdoc/no-undefined-types': 'warn',
    },
  },

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
