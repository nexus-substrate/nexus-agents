/**
 * The one place the TypeScript compiler is loaded from (#6405).
 *
 * `ts-morph` bundles its own compiler copy (`@ts-morph/common/dist/typescript.js`),
 * and the standalone `typescript` package is a second, identical-in-purpose
 * copy. Together they held −120 MB RSS / −43 MB heap in an idle MCP server
 * that had not yet run a single AST tool (profile on #5231): a static
 * `import` anywhere on the server entry path pulls both in at startup, and
 * tsup hoists even a `await import()` into a statically imported chunk when
 * the importing module is itself imported statically.
 *
 * `createRequire` — the same device `context/open-database.ts` uses for
 * `node:sqlite` (#5392) — keeps the load SYNCHRONOUS, so every exported
 * extractor keeps its signature, while deferring it to the first call. Node
 * caches the module, and the memo below just skips the resolver after that.
 *
 * Only ts-morph is loaded; the standalone `typescript` package is never
 * required at runtime any more. `getTypescript()` hands out ts-morph's `ts`
 * so the raw compiler API (`symbol-extractor.ts`) and the ts-morph wrapper
 * share ONE compiler copy.
 *
 * Types stay `import type` (erased); only these two functions touch the
 * runtime module.
 *
 * @module indexer/lazy-compiler
 */

import { createRequire } from 'node:module';

type TsMorphModule = typeof import('ts-morph');

const requireFromHere = createRequire(import.meta.url);

let tsMorph: TsMorphModule | undefined;

/** The `ts-morph` module, loaded on first call. */
export function getTsMorph(): TsMorphModule {
  tsMorph ??= requireFromHere('ts-morph') as TsMorphModule;
  return tsMorph;
}

/** The raw TypeScript compiler API — ts-morph's bundled copy, not a second one. */
export function getTypescript(): TsMorphModule['ts'] {
  return getTsMorph().ts;
}
