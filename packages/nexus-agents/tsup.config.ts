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
  external: ['ts-morph', '@ts-morph/common', 'better-sqlite3', 'typescript'],
  define: {
    __NEXUS_VERSION__: JSON.stringify(pkg.version),
  },
  onSuccess: 'cp -r src/workflows/templates dist/workflows/ 2>/dev/null || true',
});
