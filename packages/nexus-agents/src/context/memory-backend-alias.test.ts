/**
 * The context-store contract has one public name after the 9.0 removal (#5452).
 * TypeScript erases interfaces, so inspect identifiers as well as assignability.
 *
 * @module context/memory-backend-alias.test
 */
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { IContextMemoryBackend } from './memory-backend-types.js';
import type { IContextMemoryBackend as PublicBackend } from '../exports/benchmarks.js';
import type { IContextMemoryBackend as ContextBackend } from './index.js';
import type { IContextMemoryBackend as DirectBackend } from './memory-backend.js';

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const publicContract: MutuallyAssignable<PublicBackend, IContextMemoryBackend> = true;
const contextContract: MutuallyAssignable<ContextBackend, IContextMemoryBackend> = true;
const directContract: MutuallyAssignable<DirectBackend, IContextMemoryBackend> = true;

function identifiersIn(relativePath: string): string[] {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
  const identifiers: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) identifiers.push(node.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return identifiers;
}

describe('context memory contract after 9.0 (#5452)', () => {
  it('exports the canonical contract through every existing barrel', () => {
    expect(publicContract).toBe(true);
    expect(contextContract).toBe(true);
    expect(directContract).toBe(true);
  });

  it.each([
    './memory-backend-types.ts',
    './memory-backend.ts',
    './index.ts',
    '../exports/benchmarks.ts',
  ])('%s exposes only the canonical context backend name', (relativePath) => {
    const identifiers = identifiersIn(relativePath);
    expect(identifiers).toContain('IContextMemoryBackend');
    expect(identifiers).not.toContain('IMemoryBackend');
  });
});
