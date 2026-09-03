import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  outDir: 'dist',
  // #5388: `node:sqlite` MUST be listed. Without it the bundler rewrites the
  // specifier to a bare `sqlite`, and the built package dies at import with
  // `Cannot find package 'sqlite'` — verified by building and reading dist,
  // after an earlier comment here asserted the opposite. Other `node:` builtins
  // in this package are reached through the same bundle, so keep any new one
  // added here too.
  // tsup v8 strips `node:` prefixes by default (`removeNodeProtocol`). That is
  // harmless for legacy builtins — bare `fs` still resolves — but FATAL for
  // `node:sqlite`, which Node exposes ONLY under the prefixed specifier. The
  // stripped `import ... from "sqlite"` built fine and died at import with
  // `Cannot find package 'sqlite'`.
  removeNodeProtocol: false,
});
