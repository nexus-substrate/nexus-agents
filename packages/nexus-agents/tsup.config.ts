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
  outDir: 'dist',
  // ts-morph uses CommonJS internally and must be external.
  // better-sqlite3 is a native C++ addon and cannot be bundled.
  // ts-morph/typescript use CommonJS internally (require("fs")) and must be external.
  // better-sqlite3 is a native C++ addon and cannot be bundled.
  // @ast-grep/lang-{python,go} (#4249 child C) resolve their `.so` grammar via a
  // `__dirname`-relative lookup (see @ast-grep/setup-lang's `resolvePrebuild`).
  // Bundling would rewrite `__dirname` to point at our `dist/` output instead of
  // the installed package directory where the prebuilt `.so`/`prebuilds/` live,
  // so these MUST stay external like the other native-addon deps above.
  external: [
    'ts-morph',
    '@ts-morph/common',
    'better-sqlite3',
    'typescript',
    '@ast-grep/lang-python',
    '@ast-grep/lang-go',
  ],
  define: {
    __NEXUS_VERSION__: JSON.stringify(pkg.version),
  },
  onSuccess: [
    'cp -r src/workflows/templates dist/workflows/ 2>/dev/null || true',
    // T2 bundled model registry (#2174 / #2175) — runtime reads from dist
    'cp src/config/model-registry.generated.json dist/model-registry.generated.json 2>/dev/null || true',
    // Polyglot QA/security ast-grep rules (#4249 child C) — YAML, tsup won't bundle
    // it. Only the *.yml rules ship to dist; fixtures/ are test-only.
    'mkdir -p dist/security/ast-rules && cp src/security/ast-rules/*.yml dist/security/ast-rules/ 2>/dev/null || true',
  ].join(' && '),
});
