/**
 * #5129 item 6: the MCP tool-result shape has ONE authoritative definition
 * (`mcp/tools/tool-result.ts`). The middleware chain and delegate_to_model
 * re-export it rather than redeclaring a structurally-identical copy, so a
 * field added to the canonical type (e.g. `_meta`, #2649) cannot silently
 * drift out of one of the copies.
 *
 * Type identity is asserted at compile time (`pnpm typecheck` fails if the
 * aliases are ever replaced by independent declarations that diverge); the
 * runtime assertions pin the source-level invariant that no second
 * declaration exists, which structural typing alone cannot detect.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, expectTypeOf } from 'vitest';
import type { ToolResult as CanonicalToolResult } from './tool-result.js';
import type { ToolResult as ChainToolResult } from '../middleware/middleware-chain.js';
import type { ToolResult as DelegateToolResult } from './delegate-to-model-types.js';

function readSibling(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const DECLARATION = /^export\s+(interface|type)\s+ToolResult\b(?!\s*=\s*Canonical)/mu;

describe('ToolResult single source of truth (#5129 item 6)', () => {
  it('middleware-chain ToolResult is the canonical type', () => {
    expectTypeOf<ChainToolResult>().toEqualTypeOf<CanonicalToolResult>();
  });

  it('delegate-to-model ToolResult is the canonical type', () => {
    expectTypeOf<DelegateToolResult>().toEqualTypeOf<CanonicalToolResult>();
  });

  it('canonical module still declares ToolResult (the check is not vacuous)', () => {
    expect(readSibling('./tool-result.ts')).toMatch(/^export interface ToolResult\b/mu);
  });

  it.each([['../middleware/middleware-chain.ts'], ['./delegate-to-model-types.ts']])(
    '%s does not redeclare ToolResult',
    (file) => {
      expect(readSibling(file)).not.toMatch(DECLARATION);
    }
  );
});
