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

  // #5191: adapter ACQUISITION goes through `getGlobalRegistry()`.
  //
  // `createAllAdapters()` is NOT deprecated — #5191 ratified it as canonical for
  // a different operation (building the router's arm set), and CLAUDE.md's
  // canonical-paths table lists both. Calling it deprecated here contradicted
  // the `router-construction-operation-5191` block below and would have
  // misdirected anyone reading the rule's message while doing legitimate router
  // construction (#5313). What this rule bans is using it FOR ACQUISITION: it
  // returns RAW adapters with no shared circuit-breaker registry, so each
  // caller's breaker state is isolated —
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
                'Adapter ACQUISITION goes through getGlobalRegistry() (adapters/unified-registry.ts) — createAllAdapters returns raw adapters with no shared circuit-breaker registry (#5191, #4330). Building the ROUTER arm set is a different, legitimate operation: add the file to router-construction-operation-5191 instead of migrating.',
            },
          ],
        },
      ],
      // #5313: the dynamic form, which `no-restricted-imports` cannot see.
      // The gap was documented above as needing "a bespoke rule, which epic
      // #5121's constraint 1 says not to build" — that turned out to be wrong.
      // `no-restricted-syntax` is stock, and `ImportExpression` is a standard
      // ESTree node, so the selector below buys the detection exactly as
      // constraint 1 requires. Nothing bespoke is built.
      //
      // The selector matches the MODULE, not the symbol: a dynamic import has
      // no `importNames` equivalent, because the destructuring happens after
      // the import expression resolves. That is coarser than the static rule —
      // it also catches a dynamic import of the barrel for some other symbol —
      // which is why it lives in the same scope, with the same exemptions.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportExpression[source.value=/cli-adapters\\u002F(factory|index)\\.js$/]",
          message:
            'Dynamic import of cli-adapters/factory or /index is restricted for the same reason as the static form (#5191, #5313). Router construction is exempt — add the file to router-construction-operation-5191.',
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
    // Both rules: `expert-bridge.ts` reaches `createAllAdapters` through a
    // DYNAMIC import, so it is caught by `no-restricted-syntax` rather than
    // `no-restricted-imports`. Exempting only the latter would have left a
    // ratified-legitimate call site failing lint (#5313).
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
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
      // #5313: surfaced by the new dynamic-import rule, which the static rule
      // could not see. This one is NOT a probe exemption despite resembling
      // doctor. A 7-voter panel (audit #138) put the two side by side, and all
      // five approvers landed on migrating it: doctor's consumer is a human
      // asking "is this CLI alive right now", so bypassing the breaker is the
      // point; `list_available_models` is a DISCOVERY surface consumed by
      // agents choosing where to route, and for that consumer an open breaker
      // is signal rather than staleness — advertising a transport the router
      // will refuse to use makes the agent rediscover a failure the substrate
      // already knew about.
      //
      // `warn`, not `off`: the migration changes what the tool measures (raw
      // transport reachability → router-usable availability) and needs its own
      // change with tests and a description update. Kept visible in every lint
      // run until then rather than silenced.
      'packages/nexus-agents/src/mcp/tools/list-available-models-tool.ts',
    ],
    rules: { 'no-restricted-imports': 'warn', 'no-restricted-syntax': 'warn' },
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
