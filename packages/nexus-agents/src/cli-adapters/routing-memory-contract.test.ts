import { describe, expectTypeOf, it } from 'vitest';
import type {
  IRoutingMemory as ExportedRoutingMemory,
  RoutingMemoryStats as ExportedRoutingMemoryStats,
} from '../exports/cli-adapters.js';
import type {
  IRoutingMemory,
  RoutingMemory,
  RoutingMemoryStats,
} from '../context/routing-memory.js';

describe('CLI adapters routing memory contract', () => {
  it('exports the live synchronous routing memory interface', () => {
    expectTypeOf<ExportedRoutingMemory>().toEqualTypeOf<IRoutingMemory>();
  });

  it('accepts the live RoutingMemory implementation', () => {
    expectTypeOf<RoutingMemory>().toExtend<ExportedRoutingMemory>();
  });

  it('exports the live routing memory statistics', () => {
    expectTypeOf<ExportedRoutingMemoryStats>().toEqualTypeOf<RoutingMemoryStats>();
  });
});
