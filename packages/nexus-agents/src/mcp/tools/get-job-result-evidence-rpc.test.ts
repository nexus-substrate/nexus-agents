/** Actual SDK delivery must preserve failed-plan evidence bytes and digests (#7424). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '../sdk-types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { nexusDataPath, resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import {
  appendCancellation,
  initTaskState,
  readTaskState,
} from '../../context/structured-task-state.js';
import { FAKE_ANTHROPIC_KEY, FAKE_PASSWORD } from '../../testing/test-secrets.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { _resetForTests as resetConcurrency, tryAcquire } from '../jobs/job-concurrency.js';
import { readJobResult, writeJobCancelled, writeJobPending } from '../jobs/job-result-store.js';
import { runJobInBackground } from '../jobs/run-as-job.js';
import {
  PlanFailureEvidenceSchema,
  PLAN_EVIDENCE_TEXT_MAX_BYTES,
} from '../jobs/job-plan-failure-evidence.js';
import { registerGetJobResultTool } from './get-job-result-tool.js';
import { toolStructuredError } from './tool-result.js';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const passwordValue = FAKE_PASSWORD.slice('password='.length);
const sources = ['sidecar', 'task_state'] as const;
type Source = (typeof sources)[number];
const cases = [
  {
    name: 'plain',
    text: 'First test the complete plan. Then implement it. 😀',
    redacted: false,
    truncated: false,
  },
  {
    name: 'redacted',
    text: `${FAKE_PASSWORD}\n${FAKE_ANTHROPIC_KEY}`,
    redacted: true,
    truncated: false,
  },
  {
    name: 'multiline-redacted-truncated',
    text: `${FAKE_PASSWORD}\n${'😀 evidence '.repeat(6000)}`,
    redacted: true,
    truncated: true,
  },
  {
    name: 'redaction-shrunk',
    text: FAKE_PASSWORD.repeat(6000),
    redacted: true,
    truncated: false,
  },
  {
    name: 'redacted-truncated',
    text: `${'😀 evidence '.repeat(6000)}\n${FAKE_PASSWORD}`,
    redacted: true,
    truncated: true,
  },
  {
    name: 'escaped-json',
    text: JSON.stringify({
      note: '"quoted"\nC:\\fixture\\path',
      credential: FAKE_PASSWORD,
      fixture: FAKE_ANTHROPIC_KEY,
    }),
    redacted: true,
    truncated: false,
  },
];
const BodySchema = z.object({
  found: z.literal(true),
  producerVersionMeasured: z.boolean(),
  producerVersionSource: z.enum(sources),
  record: z.object({
    status: z.enum(['failed', 'cancelled']),
    producerVersion: z.string().optional(),
    result: z.unknown().optional(),
    failureEvidence: PlanFailureEvidenceSchema.optional(),
  }),
});

function assertTextEvidence(
  retained: z.infer<typeof PlanFailureEvidenceSchema>['plan'] | undefined,
  raw: string,
  redacted: boolean,
  truncated: boolean
): void {
  if (retained === undefined || retained.coverage === 'invalid') {
    throw new Error('Valid fixture evidence was absent or invalid');
  }
  expect(retained.redacted).toBe(redacted);
  expect(retained.truncated).toBe(truncated);
  expect(retained.rawBytes).toBe(Buffer.byteLength(raw, 'utf8'));
  expect(retained.rawSha256).toBe(sha256(raw));
  expect(retained.retainedBytes).toBe(Buffer.byteLength(retained.text, 'utf8'));
  expect(retained.retainedBytes).toBeLessThanOrEqual(PLAN_EVIDENCE_TEXT_MAX_BYTES);
  expect(retained.retainedSha256).toBe(sha256(retained.text));
  expect(retained.text.isWellFormed()).toBe(true);
  if (!redacted && !truncated) expect(retained.text).toBe(raw);
}

describe('get_job_result evidence through real SDK RPC (#7424)', () => {
  let dataDir: string;
  let server: McpServer;
  let client: Client;
  const oldDataDir = process.env['NEXUS_DATA_DIR'];
  const oldSource = process.env['NEXUS_JOB_RESULT_SOURCE'];

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nexus-evidence-rpc-'));
    process.env['NEXUS_DATA_DIR'] = dataDir;
    delete process.env['NEXUS_JOB_RESULT_SOURCE'];
    resetNexusDataDirCache();
    resetConcurrency();
    server = new McpServer({ name: 'evidence-rpc-fixture', version: '1.0.0' });
    client = new Client({ name: 'evidence-rpc-client', version: '1.0.0' });
    registerGetJobResultTool(server, {
      rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    try {
      await Promise.all([client.close(), server.close()]);
    } finally {
      if (oldDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = oldDataDir;
      if (oldSource === undefined) delete process.env['NEXUS_JOB_RESULT_SOURCE'];
      else process.env['NEXUS_JOB_RESULT_SOURCE'] = oldSource;
      resetNexusDataDirCache();
      resetConcurrency();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  async function settle(
    jobId: string,
    source: Source,
    plan: string,
    cancelled = false
  ): Promise<string> {
    if (source === 'sidecar') process.env['NEXUS_JOB_RESULT_SOURCE'] = 'sidecar';
    const proposal = `Review the exact plan:\n${plan}\nEND PROPOSAL`;
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(jobId, 'run_dev_pipeline');
    await runJobInBackground(jobId, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => jobId,
      run: () => {
        if (source === 'task_state') {
          expect(
            initTaskState({
              taskId: jobId,
              stage: 'failed',
              decisions: [],
              blockers: [],
              position: { currentStep: 'plan' },
              updatedAt: new Date().toISOString(),
            }).ok
          ).toBe(true);
          if (cancelled)
            expect(
              appendCancellation(jobId, {
                requestedAt: new Date().toISOString(),
                reason: 'Fixture cancellation',
              }).ok
            ).toBe(true);
        }
        if (cancelled) writeJobCancelled(jobId, 'run_dev_pipeline', 'Fixture cancellation');
        return Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: {
              completed: false,
              planStatus: 'unapproved',
              plan,
              planVoteProposal: proposal,
            },
          })
        );
      },
    });
    return proposal;
  }

  async function rpc(jobId: string): Promise<{ body: z.infer<typeof BodySchema>; wire: string }> {
    const raw = await client.callTool({ name: 'get_job_result', arguments: { jobId } });
    const result = z
      .object({
        isError: z.boolean().optional(),
        content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
      })
      .parse(raw);
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);
    const wire = result.content[0]?.text;
    if (wire === undefined) throw new Error('RPC returned no evidence payload');
    return { body: BodySchema.parse(JSON.parse(wire)), wire };
  }

  for (const source of sources) {
    it.each(cases)(
      `${source} preserves actual $name delivery bytes and hashes`,
      async (fixture) => {
        const jobId = `dp-rpc-${source}-${fixture.name}`;
        const proposal = await settle(jobId, source, fixture.text);
        const stored = readJobResult(jobId);
        expect(stored?.status).toBe('failed');
        const storedEvidence = PlanFailureEvidenceSchema.parse(stored?.failureEvidence);
        const { body, wire } = await rpc(jobId);
        expect(body.producerVersionSource).toBe(source);
        expect(body.record.status).toBe('failed');
        expect(body.record.result).toBeUndefined();
        expect(body.record.failureEvidence).toEqual(storedEvidence);
        const evidence = PlanFailureEvidenceSchema.parse(body.record.failureEvidence);
        expect(evidence.jobId).toBe(jobId);
        const pairs = [
          [evidence.plan, fixture.text],
          [evidence.proposal, proposal],
        ] as const;
        for (const [retained, raw] of pairs) {
          assertTextEvidence(retained, raw, fixture.redacted, fixture.truncated);
        }
        const disk = readFileSync(nexusDataPath('jobs', `result-${jobId}.json`), 'utf8');
        for (const serialized of [disk, wire]) {
          expect(serialized).not.toContain(FAKE_ANTHROPIC_KEY);
          expect(serialized).not.toContain(passwordValue);
        }
        if (source === 'task_state') {
          expect(body.producerVersionMeasured).toBe(false);
          expect(body.record.producerVersion).toBeUndefined();
          const state = readTaskState(jobId);
          if (!state.ok) throw state.error;
          expect(state.value.dispatch).toBe('async');
          expect(state.value.asyncDispatchId).toBe(evidence.dispatchId);
          expect(state.value.result).toMatchObject({
            kind: 'job_failure_evidence',
            failureEvidence: evidence,
          });
        }
      }
    );

    it(`${source} preserves cancellation without attaching late failure evidence`, async () => {
      const jobId = `dp-rpc-${source}-cancelled`;
      await settle(jobId, source, FAKE_PASSWORD, true);
      const { body, wire } = await rpc(jobId);
      expect(body.producerVersionSource).toBe(source);
      expect(body.record.status).toBe('cancelled');
      expect(body.record.result).toBeUndefined();
      expect(body.record.failureEvidence).toBeUndefined();
      expect(readJobResult(jobId)?.failureEvidence).toBeUndefined();
      expect(wire).not.toContain(passwordValue);
    });
  }
});
