#!/usr/bin/env node
/**
 * Prebuild/predev step: publishes remarque-tokens' prebuilt Palette Deck
 * stylesheet (deck.css, 15 audited light/dark pairs) into public/palettes/ so
 * the site serves it as one cached file, linked from DeckInit.astro. The
 * picker reads deck.json straight from the package at build time, so only
 * the stylesheet is copied. public/palettes/ is gitignored.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const outDir = resolve(import.meta.dirname, '..', 'public', 'palettes');
mkdirSync(outDir, { recursive: true });
copyFileSync(require.resolve('remarque-tokens/deck.css'), join(outDir, 'deck.css'));
console.log(`copy-palette-deck: remarque-tokens/deck.css -> ${outDir}`);
