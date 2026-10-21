/** Canonical reader compatibility controls; no historical executable is run here. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TraceAttributionSnapshotSchema } from './trace-schema.js';
import { traceDigest, validateTraceSnapshot } from './trace-attribution.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { EventBus } from './event-bus.js';
import { TraceWriter } from './trace-writer.js';

const runId = 'loss-compatibility';
const origin = { kind: 'run', producer: 'dev-pipeline', runId } as const;
const row = {
  timestamp: 1,
  runId,
  eventType: 'stage.completed',
  attributionVersion: 1,
  captureOrigin: origin,
  origin,
  captureRelation: 'run_related',
};
const content = `${JSON.stringify(row)}\n`;
const retained = { run_related: 1, attempt_owned: 0, global_context: 0, unattributed: 0 };

function metadata(invalidDropped?: number): Record<string, unknown> {
  return {
    attributionVersion: 1,
    runId,
    captureOrigin: origin,
    traceBytes: Buffer.byteLength(content),
    traceSha256: traceDigest(content),
    writerObserved: {
      observed: 1 + (invalidDropped ?? 0),
      foreignDropped: 0,
      evicted: 0,
      ...(invalidDropped === undefined ? {} : { invalidDropped }),
    },
    retained,
  };
}

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trace-loss-compatibility-'));
  await mkdir(join(directory, runId));
  await writeFile(join(directory, runId, 'trace.jsonl'), content);
});
afterEach(async () => {
  vi.doUnmock('./trace-schema.js');
  vi.resetModules();
  await rm(directory, { recursive: true, force: true });
});

async function query(raw: unknown): ReturnType<typeof queryTraceFromDisk> {
  await writeFile(join(directory, runId, 'trace-attribution.json'), JSON.stringify(raw));
  return queryTraceFromDisk({ runId }, directory);
}

describe('new reader and historical version-one metadata', () => {
  it('distinguishes actual new-writer zero from the same legacy sidecar with the field omitted', async () => {
    const writer = new TraceWriter(new EventBus(), { runId, runsDir: directory, origin });
    try {
      await writer.flush();
    } finally {
      writer.stop();
    }
    const file = join(directory, runId, 'trace-attribution.json');
    const emitted = TraceAttributionSnapshotSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    expect(emitted.writerObserved.invalidDropped).toBe(0);
    expect((await queryTraceFromDisk({ runId }, directory)).attribution).toMatchObject({
      status: 'measured',
      writerObserved: { invalidDropped: 0 },
    });
    const { invalidDropped: _omitted, ...legacyCounters } = emitted.writerObserved;
    await writeFile(file, JSON.stringify({ ...emitted, writerObserved: legacyCounters }));
    expect((await queryTraceFromDisk({ runId }, directory)).attribution).toMatchObject({
      status: 'measured',
      writerObserved: { invalidDropped: null },
    });
  });

  it('accepts legacy conservation without inventing measured zero invalid loss', async () => {
    const parsed = TraceAttributionSnapshotSchema.parse(metadata());
    expect(Object.hasOwn(parsed.writerObserved, 'invalidDropped')).toBe(false);
    expect(validateTraceSnapshot(content, runId, parsed)).toMatchObject({ status: 'measured' });
    const result = await query(parsed);
    expect(result).toMatchObject({
      totalEvents: 1,
      attribution: {
        status: 'measured',
        writerObserved: { observed: 1, invalidDropped: null },
        retained,
      },
    });
  });

  it.each([0, 2])(
    'keeps explicit counted invalid loss %i distinct from legacy absence',
    async (loss) => {
      const parsed = TraceAttributionSnapshotSchema.parse(metadata(loss));
      expect(Object.hasOwn(parsed.writerObserved, 'invalidDropped')).toBe(true);
      expect(parsed.writerObserved.invalidDropped).toBe(loss);
      expect(validateTraceSnapshot(content, runId, parsed)).toMatchObject({
        status: 'measured',
        entries: [row],
      });
      // Measured means byte-bound counters, not complete capture: loss remains visible.
      expect(await query(parsed)).toMatchObject({
        totalEvents: 1,
        attribution: {
          status: 'measured',
          writerObserved: { observed: 1 + loss, invalidDropped: loss },
          retained,
          returned: retained,
        },
      });
    }
  );

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])(
    'rejects invalid counter %s at the canonical schema and reader',
    (invalidDropped) => {
      const raw = {
        ...metadata(),
        writerObserved: { observed: 1, foreignDropped: 0, evicted: 0, invalidDropped },
      };
      expect(TraceAttributionSnapshotSchema.safeParse(raw).success).toBe(false);
      expect(validateTraceSnapshot(content, runId, raw)).toEqual({
        status: 'unmeasured',
        reason: 'invalid_metadata',
      });
    }
  );

  it('requires invalid loss in conservation instead of accepting the legacy sum', async () => {
    const raw = {
      ...metadata(),
      writerObserved: { observed: 1, foreignDropped: 0, evicted: 0, invalidDropped: 2 },
    };
    expect(TraceAttributionSnapshotSchema.safeParse(raw).success).toBe(false);
    expect(validateTraceSnapshot(content, runId, raw)).toEqual({
      status: 'unmeasured',
      reason: 'invalid_metadata',
    });
    expect(await query(raw)).toMatchObject({
      totalEvents: 1,
      attribution: { status: 'unmeasured', reason: 'invalid_metadata', writerObserved: null },
    });
  });

  it('rejects a sum beyond safe integer even when every individual counter is safe', () => {
    const raw = {
      ...metadata(),
      writerObserved: {
        observed: Number.MAX_SAFE_INTEGER,
        foreignDropped: Number.MAX_SAFE_INTEGER,
        evicted: 0,
        invalidDropped: 1,
      },
    };
    expect(validateTraceSnapshot(content, runId, raw)).toEqual({
      status: 'unmeasured',
      reason: 'invalid_metadata',
    });
  });

  it.each(['digest', 'bytes', 'run', 'capture'] as const)(
    'preserves snapshot %s binding with counted invalid loss',
    async (damage) => {
      const raw = metadata(2);
      if (damage === 'digest') raw['traceSha256'] = '0'.repeat(64);
      if (damage === 'bytes') raw['traceBytes'] = Buffer.byteLength(content) + 1;
      if (damage === 'run') raw['runId'] = 'another-run';
      if (damage === 'capture') raw['captureOrigin'] = { ...origin, producer: 'graph-pipeline' };
      expect(validateTraceSnapshot(content, runId, raw).status).toBe('unmeasured');
      const result = await query(raw);
      expect(result.attribution).toMatchObject({ status: 'unmeasured', writerObserved: null });
      expect(result.events[0]?.['captureRelation']).toBeUndefined();
    }
  );
});

describe('old strict counter-contract substitution, not historical reader execution', () => {
  it.each([0, 2])('fails closed on new metadata containing invalidDropped=%i', async (loss) => {
    // Base 147f43's writerObserved contract was strict observed/foreignDropped/evicted.
    // Reuse canonical validators and remove only the added field; no copied validator,
    // permissive passthrough, git-dependent fixture or historical-binary claim.
    const oldCounterContract = TraceAttributionSnapshotSchema.shape.writerObserved.omit({
      invalidDropped: true,
    });
    const substitutedSchema = TraceAttributionSnapshotSchema.safeExtend({
      writerObserved: oldCounterContract,
    });
    expect(substitutedSchema.safeParse(metadata()).success).toBe(true);
    const rejected = substitutedSchema.safeParse(metadata(loss));
    expect(rejected.success).toBe(false);
    if (!rejected.success) {
      expect(rejected.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'unrecognized_keys', keys: ['invalidDropped'] }),
        ])
      );
    }
    vi.resetModules();
    vi.doMock('./trace-schema.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./trace-schema.js')>();
      return { ...actual, TraceAttributionSnapshotSchema: substitutedSchema };
    });
    const reader = await import('./trace-attribution.js');
    expect(reader.validateTraceSnapshot(content, runId, metadata(loss))).toEqual({
      status: 'unmeasured',
      reason: 'invalid_metadata',
    });
    await writeFile(
      join(directory, runId, 'trace-attribution.json'),
      JSON.stringify(metadata(loss))
    );
    const diskReader = await import('../mcp/tools/query-trace-tool.js');
    const result = await diskReader.queryTraceFromDisk({ runId }, directory);
    expect(result.attribution).toMatchObject({
      status: 'unmeasured',
      reason: 'invalid_metadata',
      writerObserved: null,
    });
    expect(result.events[0]?.['captureRelation']).toBeUndefined();
  });
});
