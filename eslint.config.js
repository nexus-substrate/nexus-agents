import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import noVacuousVerdict from './eslint-rules/no-vacuous-verdict.js';

/**
 * In-repo custom rules (#4581). Flat config lets a plugin be an object literal,
 * so this needs no separate package — the rules live in `eslint-rules/` and are
 * covered by RuleTester fixtures under the root vitest config.
 */
const nexusRules = { rules: { 'no-vacuous-verdict': noVacuousVerdict } };

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
      // jsdoc/no-undefined-types is intentionally OMITTED: in TypeScript, type
      // references are import-resolved and already enforced by the compiler
      // (strictTypeChecked), so the rule is redundant for real accuracy. Its
      // only signal here was 10 false-positives on legitimate `{@link symbol}`
      // navigation references (which may point at any symbol, imported or not).
      // Investigated in the #3518 follow-up — see that PR for the per-site review.
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
    plugins: { nexus: nexusRules },
    rules: {
      // A verdict aggregated over an empty collection reports a pass having
      // measured nothing. Measured before enabling: 68 `.every()` sites, 10
      // real defects — hence verdict-position scoping rather than a blanket
      // ban. See the rule's own header for its known blind spot (#4581).
      'nexus/no-vacuous-verdict': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true },
      ],
      // Code structure limits (enforced)
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-params': ['error', 5],
      'max-depth': ['error', 4],

      // TypeScript strict rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
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

  // The one site the rule flags that this repo may not fix unilaterally.
  // `src/governance/claims-verify.ts:202` reports `passed: true` over an empty
  // claims registry, but governance source requires owner ratification and is
  // never auto-merged (CODEOWNERS, and the Mission section of CLAUDE.md). The
  // exemption is deliberately a single file at warn rather than a silent `off`
  // or a directory-wide skip, so the governor's own violation stays visible in
  // every lint run until #4586 lands and this block is deleted.
  {
    name: 'nexus-agents/vacuous-verdict-governance-pending-4586',
    files: ['packages/nexus-agents/src/governance/claims-verify.ts'],
    rules: { 'nexus/no-vacuous-verdict': 'warn' },
  },

  // #5191: adapter acquisition goes through `getGlobalRegistry()`. The
  // deprecated `createAllAdapters()` returns RAW adapters with no shared
  // circuit-breaker registry, so each caller's breaker state is isolated —
  // "one adapter keeps routing to a CLI another has already seen fail", the
  // exact failure #4330 added the shared registry to prevent
  // (`adapters/unified-registry.ts:150`).
  //
  // Buy the detection, build only the wrapper (epic #5121 constraint 1): this
  // is the stock rule, not a bespoke gate.
  {
    name: 'nexus-agents/canonical-adapter-acquisition-5191',
    files: ['packages/nexus-agents/src/**/*.ts'],
    ignores: [
      // The definition itself.
      'packages/nexus-agents/src/cli-adapters/factory.ts',
      // The PUBLIC export surface re-exports this symbol
      // (`exports/cli-adapters.ts:52`). That is an export, not a use — banning
      // it here would drop `createAllAdapters` from the package's public API,
      // which is a semver decision for #5191, not a side effect of a lint rule.
      // The rule found this surface; enumerating it by hand had missed it.
      'packages/nexus-agents/src/exports/cli-adapters.ts',
      '**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // `patterns` with a glob, not `paths` with a literal: the specifier is
          // RELATIVE, so its depth varies by importer ('../cli-adapters/...'
          // vs '../../cli-adapters/...'). A literal entry silently misses every
          // importer at a different depth.
          //
          // Both the module AND the barrel are listed, because the symbol is
          // re-exported at `cli-adapters/index.ts:87` and one call site reaches
          // it that way. `importNames` keeps the ban to this one symbol, so the
          // rest of the barrel is unaffected.
          //
          // KNOWN GAP, stated rather than papered over: this does NOT catch
          // `const { createAllAdapters } = await import(...)`. Two call sites
          // use that form (`pipeline/expert-bridge.ts:273`,
          // `mcp/tools/list-available-models-tool.ts:137`) and are invisible to
          // it. They are enumerated in #5191; a dynamic-import ban would need a
          // bespoke rule, which epic #5121's constraint 1 says not to build.
          patterns: [
            {
              group: ['**/cli-adapters/factory.js', '**/cli-adapters/index.js'],
              importNames: ['createAllAdapters'],
              message:
                'Use getGlobalRegistry() (adapters/unified-registry.ts) — createAllAdapters returns raw adapters with no shared circuit-breaker registry (#5191, #4330).',
            },
          ],
        },
      ],
    },
  },

  // ROUTER CONSTRUCTION is a second, legitimate operation (#5191, ratified 5/6)
  // — not drift. `createCompositeRouter` takes `Map<RoutingArmId, ICliAdapter>`;
  // the registry offers `IResilientAdapter` (which extends `IModelAdapter`) one
  // CLI at a time, so the canonical path structurally cannot serve these two.
  //
  // It also should not: the router IS the selection/failover layer, so
  // resilient-wrapped arms would nest two failover mechanisms, and shared
  // breaker state would make an arm report unavailable without the router ever
  // testing it — the same defect the doctor-probe exemption documents (#5209).
  {
    name: 'nexus-agents/router-construction-operation-5191',
    files: [
      'packages/nexus-agents/src/pipeline/expert-bridge.ts',
      'packages/nexus-agents/src/cli/orchestrate-command.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Audit-sink interfaces must declare members as function PROPERTIES, never
  // method shorthand (#4991). TypeScript exempts method-shorthand parameters
  // from `strictFunctionTypes` and checks them bivariantly, so widening a
  // parameter union on a method lets a stale out-of-tree implementor keep
  // compiling and then mishandle the new value at runtime — on the audit path,
  // that means silently dropped records.
  //
  // Scoped to the audit types rather than applied repo-wide: this is a real
  // constraint for an interface that external code implements and whose
  // parameter unions grow, not a general style preference, and a repo-wide flip
  // would be a large unrelated diff. `audit-types-variance.test.ts` asserts the
  // same invariant on the source, so the guarantee does not rest on lint alone.
  {
    name: 'nexus-agents/audit-sink-contravariance-4991',
    files: ['packages/nexus-agents/src/audit/audit-types.ts'],
    rules: {
      '@typescript-eslint/method-signature-style': ['error', 'property'],
    },
  },

  // The four existing call sites, visible at `warn` rather than silenced.
  // Same shape as the vacuous-verdict exemption above: an explicit named block
  // that keeps the debt in every lint run until #5191 migrates them, instead of
  // an `off` or a directory-wide skip that would hide it.
  //
  // Each needs a judgement, not a blanket replace — `doctor` probes liveness and
  // may legitimately want an unwrapped adapter. Delete this block as the list
  // empties.
  {
    name: 'nexus-agents/adapter-acquisition-baseline-pending-5191',
    files: [
      'packages/nexus-agents/src/cli/doctor.ts',
      'packages/nexus-agents/src/cli/doctor-live.ts',
      'packages/nexus-agents/src/cli/demo-command.ts',
    ],
    rules: { 'no-restricted-imports': 'warn' },
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
