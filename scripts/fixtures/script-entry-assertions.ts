/** Shared actual-entry evidence assertions for the three script families (#7682). */
import { expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import type { EntryResult, ScriptEntryFixture } from './script-entry-fixture.js';

export function assertEntryEnvelope(result: EntryResult): void {
  expect(result.process.error).toBeUndefined();
  expect(result.process.signal).toBeNull();
  expect(result.loaderIpcBlocked).toHaveLength(2);
  const sealed = result.timeline.map((event) => event.name).indexOf('bootstrap:sealed');
  expect(sealed).toBeGreaterThan(0);
  expect(result.timeline.filter((event) => event.name === 'bootstrap:sealed')).toHaveLength(1);
  expect(result.timeline[0]?.name).toBe('boundary:installed');
  const startup = result.timeline.filter((event) => event.name === 'loader:tsx-ipc-BLOCKED');
  expect(startup).toHaveLength(2);
  for (const event of startup) {
    expect(event.phase).toBe('startup');
    expect(result.timeline.indexOf(event)).toBeLessThan(sealed);
  }
  const subjects = result.timeline.filter((event) => event.name === 'subject:resolved');
  expect(subjects.length).toBeGreaterThan(0);
  for (const event of subjects) {
    expect(event.phase).toBe('sealed');
    expect(result.timeline.indexOf(event)).toBeGreaterThan(sealed);
  }
  for (const event of result.timeline) expect(event.pid).toBe(result.process.pid);
  for (const event of result.ipc) expect(event.pid).toBe(result.process.pid);
  const ipc = result.ipc.filter((event) => event.classification === 'loader:tsx-ipc-BLOCKED');
  expect(ipc).toHaveLength(2);
  expect(new Set(ipc.map((event) => event.caller?.file)).size).toBe(2);
  for (const event of ipc) expect(event.phase).toBe('startup');
}

export function assertValidEntry(
  result: EntryResult,
  fixture: ScriptEntryFixture | undefined,
  mode: 'direct' | 'import'
): void {
  assertEntryEnvelope(result);
  expect(result.blocked).toEqual([]);
  if (fixture === undefined) throw new Error('Missing owned entry fixture');
  // This is observed Node resolution, not a claim to read the source's lexical import.meta.
  const events = result.timeline.filter((event) => event.name === 'subject:resolved');
  expect(events.map((event) => event.url)).toContain(pathToFileURL(fixture.entry).href);
  if (mode === 'direct') expect(events[0]?.argv[1]).toBe(fixture.entry);
}
