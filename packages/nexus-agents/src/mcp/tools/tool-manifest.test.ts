/**
 * Parity tests for the canonical TOOL_MANIFEST (#3566). These are the lockstep
 * guards the refactor relies on: every other tool-name list derives from or is
 * validated against the manifest, so drift fails loudly here.
 */

import { describe, it, expect } from 'vitest';
import { TOOL_MANIFEST } from './tool-manifest.js';
import { REGISTERED_TOOL_NAMES, TOOL_ANNOTATIONS } from './index.js';
import { getAvailableToolCount } from '../../core/task-analysis/capability-gap-detector.js';

// #3597: manifest entries are now `{ name, annotations, sideEffects }`.
const MANIFEST_NAMES = TOOL_MANIFEST.map((t) => t.name);

describe('TOOL_MANIFEST (canonical tool list)', () => {
  it('has no duplicate names', () => {
    expect(new Set(MANIFEST_NAMES).size).toBe(TOOL_MANIFEST.length);
  });

  it('is the exact source of REGISTERED_TOOL_NAMES (same order)', () => {
    // REGISTERED_TOOL_NAMES is the derived name list of the manifest.
    expect([...REGISTERED_TOOL_NAMES]).toEqual(MANIFEST_NAMES);
  });

  it('matches TOOL_ANNOTATIONS keys exactly (no annotation drift)', () => {
    // Every manifest tool has an annotation entry and vice-versa.
    expect(new Set(Object.keys(TOOL_ANNOTATIONS))).toEqual(new Set(MANIFEST_NAMES));
  });

  it('is the basis for the capability-gap detector AVAILABLE_TOOLS', () => {
    // gap-detector derives AVAILABLE_TOOLS = new Set(manifest names).
    expect(getAvailableToolCount()).toBe(TOOL_MANIFEST.length);
  });

  it('every entry carries annotations + at least one side effect (folded-in data #3597)', () => {
    for (const entry of TOOL_MANIFEST) {
      expect(entry.annotations, `${entry.name} annotations`).toBeDefined();
      expect(typeof entry.annotations.readOnlyHint, `${entry.name} readOnlyHint`).toBe('boolean');
      expect(entry.sideEffects.length, `${entry.name} sideEffects`).toBeGreaterThan(0);
    }
  });
});

describe('idempotentHint has something behind it (#5504)', () => {
  /**
   * `idempotentHint` is what a gateway or agent runtime reads to decide a retry
   * is safe after a lost response — the case where the client cannot tell "the
   * call succeeded and the answer was lost" from "it never happened".
   *
   * `delegate_to_model` declared it while minting a fresh run id per call, so a
   * retry delegated to the model again: a second run directory, a second trace,
   * a second bill. 3,227 `delegate-*` run directories had accumulated.
   *
   * The gate is deliberately mechanical rather than clever. It does not try to
   * infer idempotency from the implementation — a static analysis of "is there a
   * dedupe path" would be brittle and would fail honest tools. It asks only that
   * a tool making the claim writes down what absorbs the repeat, in a field a
   * reviewer can check against the code.
   *
   * Scoped to `readOnlyHint: false`, because that is where the claim is a claim
   * about BEHAVIOUR. A read-only tool is idempotent by not writing anything.
   */
  const claimsIdempotentWhileWriting = TOOL_MANIFEST.filter(
    (t) => t.annotations.idempotentHint && !t.annotations.readOnlyHint
  );

  it('finds the tools the rule applies to', () => {
    // Guards the guard: if this drops to zero the assertion below passes
    // vacuously and the gate stops gating.
    expect(claimsIdempotentWhileWriting.length).toBeGreaterThan(0);
  });

  // TOOL_MANIFEST is `as const`, so `idempotencyBasis` is present only in the
  // literal types of the entries that carry it. Read it off the widened shape —
  // the point of the test is that the field EXISTS at runtime.
  const basisOf = (name: string): string | undefined =>
    (TOOL_MANIFEST.find((t) => t.name === name) as { idempotencyBasis?: string } | undefined)
      ?.idempotencyBasis;

  it.each(claimsIdempotentWhileWriting.map((t) => t.name))(
    '%s states what absorbs a repeat call',
    (name) => {
      expect(basisOf(name), `${name} declares idempotentHint: true`).toBeDefined();
      expect(basisOf(name)?.length ?? 0).toBeGreaterThan(20);
    }
  );

  it('does not claim idempotency for delegate_to_model', () => {
    // Every call mints a fresh run id, so a retry runs the delegation again.
    const entry = TOOL_MANIFEST.find((t) => t.name === 'delegate_to_model');
    expect(entry?.annotations.idempotentHint).toBe(false);
  });

  it('keeps the basis out of the MCP annotations', () => {
    // The wire shape stays standard: idempotencyBasis is repo metadata.
    for (const tool of TOOL_MANIFEST) {
      expect((tool.annotations as Record<string, unknown>)['idempotencyBasis']).toBeUndefined();
    }
  });
});
