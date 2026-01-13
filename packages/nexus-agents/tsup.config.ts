import { defineConfig } from 'tsup';

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
  // ts-morph uses CommonJS internally and must be external
  external: ['ts-morph', '@ts-morph/common'],
  onSuccess: 'cp -r src/workflows/templates dist/workflows/ 2>/dev/null || true',
});
