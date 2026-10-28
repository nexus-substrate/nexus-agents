/**
 * Regression tests for Dependabot inventory evidence validation (#7557).
 */

import { describe, expect, it } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import { MAX_INPUT_BYTES, assessDependabotInventory } from './check-dependabot-inventory.js';
import type { DependabotInventoryAssessment } from './dependabot-inventory-context.js';
import { main } from './check-dependabot-inventory-cli.js';

const evidence = {
  repository: 'nexus-substrate/nexus-agents',
  queryOwner: 'nexus-substrate',
  queryName: 'nexus-agents',
  headSha: '84fda5dd726af222f48feb206bac2dd2717982be',
  capturedAt: '2026-10-28T17:00:00.000Z',
} as const;

const unfilteredQuery =
  'query($owner: String!, $name: String!, $endCursor: String) { repository(owner: $owner, name: $name) { vulnerabilityAlerts(first: 100, after: $endCursor) { totalCount pageInfo { hasNextPage startCursor endCursor } edges { cursor node { id state } } } } }';

function assess(
  pages: readonly unknown[],
  requestedState?: 'OPEN' | 'FIXED' | 'DISMISSED' | 'AUTO_DISMISSED'
): DependabotInventoryAssessment {
  return assessDependabotInventory(pages, {
    ...evidence,
    query: unfilteredQuery,
    ...(requestedState === undefined ? {} : { requestedState }),
  });
}

interface AlertNode {
  readonly id?: string;
  readonly state?: string;
}

interface GraphQlPageOptions {
  readonly nodes: readonly AlertNode[];
  readonly totalCount: number;
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
  readonly errors?: readonly unknown[];
}

function page({ nodes, totalCount, hasNextPage, endCursor, errors }: GraphQlPageOptions): unknown {
  return {
    ...(errors === undefined ? {} : { errors }),
    data: {
      repository: {
        vulnerabilityAlerts: {
          edges: nodes.map((node) => ({ cursor: endCursor, node })),
          totalCount,
          pageInfo: {
            hasNextPage,
            startCursor: nodes.length === 0 ? null : endCursor,
            endCursor,
          },
        },
      },
    },
  };
}

async function runCli(
  input: string,
  args: readonly string[]
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const stdin = new PassThrough();
  const stdoutChunks: string[] = [];
  const stdout = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      stdoutChunks.push(chunk.toString());
      callback();
    },
  });
  stdin.end(input);
  const exitCode = await main(args, stdin, stdout);
  return { exitCode, output: stdoutChunks.join('') };
}

describe('assessDependabotInventory', () => {
  it('rejects a FIXED row returned by an OPEN-filtered query as inconsistent', () => {
    const result = assess(
      [
        page({
          nodes: [{ id: 'alert-fixed', state: 'FIXED' }],
          totalCount: 1,
          hasNextPage: false,
          endCursor: 'cursor-1',
        }),
      ],
      'OPEN'
    );

    expect(result.status).toBe('inconsistent');
    expect(result.stateCounts).toEqual({ OPEN: 0, FIXED: 1, DISMISSED: 0, AUTO_DISMISSED: 0 });
    expect(result.scope).toBe('filtered_connection');
  });

  it('measures a complete unfiltered connection without claiming it is globally complete', () => {
    const result = assess([
      page({
        nodes: [{ id: 'alert-fixed-1', state: 'FIXED' }],
        totalCount: 2,
        hasNextPage: true,
        endCursor: 'cursor-1',
      }),
      page({
        nodes: [{ id: 'alert-fixed-2', state: 'FIXED' }],
        totalCount: 2,
        hasNextPage: false,
        endCursor: 'cursor-2',
      }),
    ]);

    expect(result.status).toBe('clean');
    expect(result.scope).toBe('accessible_connection');
    expect(result.pageCount).toBe(2);
    expect(result.reportedTotal).toBe(2);
    expect(result.uniqueAlerts).toBe(2);
    expect(result.stateCounts).toEqual({ OPEN: 0, FIXED: 2, DISMISSED: 0, AUTO_DISMISSED: 0 });
    expect(result.repository).toBe(evidence.repository);
    expect(result.headSha).toBe(evidence.headSha);
    expect(result.capturedAt).toBe(evidence.capturedAt);
    expect(result.openCount).toBe(0);
    expect(result).not.toHaveProperty('alerts');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('global');
  });

  it('does not call an empty page list a complete inventory', () => {
    const result = assess([]);

    expect(result.status).toBe('unmeasured');
    expect(result.stateCounts).toBeNull();
  });

  it('reports the open count instead of a clean result when open alerts exist', () => {
    const result = assess([
      page({
        nodes: [{ id: 'alert-open', state: 'OPEN' }],
        totalCount: 1,
        hasNextPage: false,
        endCursor: 'cursor-1',
      }),
    ]);

    expect(result.status).toBe('open_count');
    expect(result.openCount).toBe(1);
    expect(result.scope).toBe('accessible_connection');
  });

  it('does not report a filtered result as a complete accessible connection', () => {
    const result = assess(
      [
        page({
          nodes: [{ id: 'alert-open', state: 'OPEN' }],
          totalCount: 1,
          hasNextPage: false,
          endCursor: 'cursor-1',
        }),
      ],
      'OPEN'
    );

    expect(result.scope).toBe('filtered_connection');
    expect(['inconsistent', 'unmeasured']).toContain(result.status);
    expect(result.status).not.toBe('clean');
  });

  it('refuses complete-looking pages when the recorded query includes a state filter', () => {
    const result = assessDependabotInventory(
      [
        page({
          nodes: [{ id: 'alert-open', state: 'OPEN' }],
          totalCount: 1,
          hasNextPage: false,
          endCursor: 'cursor-1',
        }),
      ],
      {
        ...evidence,
        query: unfilteredQuery.replace('after: $endCursor', 'after: $endCursor, states: [OPEN]'),
      }
    );

    expect(result.status).not.toBe('clean');
    expect(result.scope).toBe('filtered_connection');
  });

  it('refuses a query for a different hard-coded repository', () => {
    const result = assessDependabotInventory(
      [page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null })],
      {
        ...evidence,
        query: unfilteredQuery.replace(
          'repository(owner: $owner, name: $name)',
          'repository(owner: "other", name: "repo")'
        ),
      }
    );

    expect(result.status).not.toBe('clean');
  });

  it('does not accept a decoy aliased repository alongside a different active repository', () => {
    const queryWithDecoy = unfilteredQuery.replace(
      'repository(owner: $owner, name: $name)',
      'decoy: repository(owner: $owner, name: $name) repository(owner: "other", name: "repo")'
    );
    const result = assessDependabotInventory(
      [page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null })],
      { ...evidence, query: queryWithDecoy }
    );

    expect(result.status).not.toBe('clean');
  });

  it('refuses query variables that do not match the reported repository', () => {
    const result = assessDependabotInventory(
      [page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null })],
      { ...evidence, queryOwner: 'different-owner' }
    );

    expect(result.status).not.toBe('clean');
  });

  it('accepts a named empty connection when its total is zero and pagination terminates', () => {
    const result = assess([
      page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null }),
    ]);

    expect(result.status).toBe('clean');
    expect(result.uniqueAlerts).toBe(0);
    expect(result.stateCounts).toEqual({ OPEN: 0, FIXED: 0, DISMISSED: 0, AUTO_DISMISSED: 0 });
  });

  it.each([
    {
      name: 'duplicate alert IDs',
      pages: [
        page({
          nodes: [{ id: 'same', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: true,
          endCursor: 'cursor-1',
        }),
        page({
          nodes: [{ id: 'same', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: false,
          endCursor: 'cursor-2',
        }),
      ],
    },
    {
      name: 'totalCount drift',
      pages: [
        page({
          nodes: [{ id: 'one', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: true,
          endCursor: 'cursor-1',
        }),
        page({
          nodes: [{ id: 'two', state: 'OPEN' }],
          totalCount: 3,
          hasNextPage: false,
          endCursor: 'cursor-2',
        }),
      ],
    },
    {
      name: 'a missing next-page cursor',
      pages: [
        page({
          nodes: [{ id: 'one', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: true,
          endCursor: null,
        }),
        page({
          nodes: [{ id: 'two', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: false,
          endCursor: 'cursor-2',
        }),
      ],
    },
    {
      name: 'a truncated final page',
      pages: [
        page({
          nodes: [{ id: 'one', state: 'OPEN' }],
          totalCount: 2,
          hasNextPage: true,
          endCursor: 'cursor-1',
        }),
      ],
    },
  ])('reports $name as incomplete or inconsistent evidence', ({ pages }) => {
    const result = assess(pages);

    expect(['inconsistent', 'unmeasured']).toContain(result.status);
    expect(result.status).not.toBe('clean');
  });

  it.each([
    { name: 'an unknown state', nodes: [{ id: 'alert-1', state: 'ARCHIVED' }] },
    { name: 'a missing state', nodes: [{ id: 'alert-1' }] },
    { name: 'a missing alert ID', nodes: [{ state: 'OPEN' }] },
  ])('reports $name without inferring inventory health', ({ nodes }) => {
    const result = assess([
      page({ nodes, totalCount: 1, hasNextPage: false, endCursor: 'cursor-1' }),
    ]);

    expect(result.status).toBe('unmeasured');
    expect(result.stateCounts).toBeNull();
  });

  it('reports GraphQL errors as unmeasured even when partial data is present', () => {
    const result = assess([
      page({
        nodes: [{ id: 'alert-1', state: 'OPEN' }],
        totalCount: 1,
        hasNextPage: false,
        endCursor: 'cursor-1',
        errors: [{ message: 'permission or partial response' }],
      }),
    ]);

    expect(result.status).toBe('unmeasured');
    expect(result.stateCounts).toBeNull();
  });

  it('reports missing connection and page metadata as unmeasured', () => {
    expect(assess([{ data: { repository: { vulnerabilityAlerts: null } } }]).status).toBe(
      'unmeasured'
    );
    expect(
      assess([
        {
          data: { repository: { vulnerabilityAlerts: { nodes: [], totalCount: 0 } } },
        },
      ]).status
    ).toBe('unmeasured');
  });

  it('requires repository, 40-character head SHA, and a valid capture timestamp', () => {
    const validPage = [page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null })];
    const missingHead = assessDependabotInventory(validPage, {
      repository: evidence.repository,
      capturedAt: evidence.capturedAt,
    });
    const invalidCapture = assessDependabotInventory(validPage, {
      ...evidence,
      capturedAt: 'not-a-timestamp',
    });

    expect(missingHead.status).toBe('unmeasured');
    expect(invalidCapture.status).toBe('unmeasured');
  });
});

describe('dependabot inventory CLI', () => {
  const args = [
    '--repository',
    evidence.repository,
    '--head-sha',
    evidence.headSha,
    '--captured-at',
    evidence.capturedAt,
  ];

  it('prints only counts and supplied provenance for a complete capture', async () => {
    const cli = await runCli(
      JSON.stringify({
        query: unfilteredQuery,
        owner: evidence.queryOwner,
        name: evidence.queryName,
        pages: [
          page({
            nodes: [{ id: 'private-alert-id', state: 'FIXED' }],
            totalCount: 1,
            hasNextPage: false,
            endCursor: 'cursor-1',
          }),
        ],
      }),
      args
    );
    const result = JSON.parse(cli.output) as {
      status: string;
      repository: string;
      headSha: string;
      capturedAt: string;
    };

    expect(cli.exitCode).toBe(0);
    expect(result.status).toBe('clean');
    expect(result.repository).toBe(evidence.repository);
    expect(result.headSha).toBe(evidence.headSha);
    expect(result.capturedAt).toBe(evidence.capturedAt);
    expect(cli.output).not.toContain('private-alert-id');
  });

  it('returns a distinct nonzero exit for a measured open count', async () => {
    const cli = await runCli(
      JSON.stringify({
        query: unfilteredQuery,
        owner: evidence.queryOwner,
        name: evidence.queryName,
        pages: [
          page({
            nodes: [{ id: 'alert-open', state: 'OPEN' }],
            totalCount: 1,
            hasNextPage: false,
            endCursor: 'cursor-1',
          }),
        ],
      }),
      args
    );

    expect(cli.exitCode).toBe(2);
    expect(JSON.parse(cli.output)).toMatchObject({ status: 'open_count', openCount: 1 });
  });

  it('bounds stdin and emits no parser or payload details on error', async () => {
    const tooLarge = await runCli('x'.repeat(MAX_INPUT_BYTES + 1), args);

    expect(tooLarge.exitCode).toBe(1);
    expect(JSON.parse(tooLarge.output)).toMatchObject({
      status: 'unmeasured',
      findings: expect.arrayContaining(['input_limit_exceeded']),
    });
    expect(tooLarge.output).not.toContain('x'.repeat(20));
  });

  it('does not echo rejected query text into sanitized output', async () => {
    const secret = 'private-query-sentinel';
    const cli = await runCli(
      JSON.stringify({
        query: `${unfilteredQuery} # ${secret}`,
        owner: evidence.queryOwner,
        name: evidence.queryName,
        pages: [page({ nodes: [], totalCount: 0, hasNextPage: false, endCursor: null })],
      }),
      args
    );

    expect(cli.exitCode).toBe(1);
    expect(JSON.parse(cli.output)).toMatchObject({ status: 'unmeasured', queryValidated: false });
    expect(cli.output).not.toContain(secret);
    expect(cli.output).not.toContain(unfilteredQuery);
  });
});
