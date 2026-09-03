import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  // #5388: tsup v8 strips `node:` prefixes by default. Harmless for legacy
  // builtins (bare `fs` resolves), FATAL for `node:sqlite`, which Node exposes
  // ONLY under the prefixed specifier — the stripped form builds cleanly and
  // dies at import with `Cannot find package 'sqlite'`.
  removeNodeProtocol: false,
  outDir: 'dist',
  // ts-morph uses CommonJS internally and must be external.
  // ts-morph/typescript use CommonJS internally (require("fs")) and must be external.
  // @ast-grep/lang-{python,go} (#4249 child C) resolve their `.so` grammar via a
  // `__dirname`-relative lookup (see @ast-grep/setup-lang's `resolvePrebuild`).
  // Bundling would rewrite `__dirname` to point at our `dist/` output instead of
  // the installed package directory where the prebuilt `.so`/`prebuilds/` live,
  // so these MUST stay external like the other native-addon deps above.
  external: [
    'ts-morph',
    '@ts-morph/common',
    'typescript',
    '@ast-grep/lang-python',
    '@ast-grep/lang-go',
  ],
  define: {
    __NEXUS_VERSION__: JSON.stringify(pkg.version),
  },
  onSuccess: [
    // `cp -r src dest/` is state-dependent: it NESTS when `dist/workflows/`
    // already exists and copies src AS `dist/workflows` when it does not, so a
    // clean build laid the templates out flat and `template-loader.ts` — which
    // looks for `dist/workflows/templates` — found nothing. Naming the target
    // explicitly makes it the same either way (#5083).
    'mkdir -p dist/workflows/templates && cp -r src/workflows/templates/. dist/workflows/templates/',
    // T2 bundled model registry (#2174 / #2175) — runtime reads from dist
    'cp src/config/model-registry.generated.json dist/model-registry.generated.json',
    // models.dev snapshot — `models-dev-snapshot-loader.ts` reads it as a
    // SIBLING of the compiled module, so it must land in dist. It never did,
    // and `package.json#files` ships only `dist`, so no installed copy has
    // ever had it: every `claude`/`codex`/`gemini` model enumeration returned
    // `[]` while dev (reading `src/config/`) returned 13/47/82. `opencode`
    // (native probe) and OpenRouter (network) masked it by still working.
    'cp src/config/models-dev-snapshot.json dist/models-dev-snapshot.json',
    // Polyglot QA/security ast-grep rules (#4249 child C) — YAML, tsup won't bundle
    // it. Only the *.yml rules ship to dist; fixtures/ are test-only.
    'mkdir -p dist/security/ast-rules && cp src/security/ast-rules/*.yml dist/security/ast-rules/',
  ].join(' && '),
});
