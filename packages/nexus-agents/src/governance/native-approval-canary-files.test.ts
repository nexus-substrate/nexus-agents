/** Prove content from immutable git objects, not a PR checkout or patch preview. */
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CanaryRead } from './native-approval-canary-read.js';
import { readCanaryFiles } from './native-approval-canary-files.js';
import { NATIVE_CANARY_POLICY as P } from './native-approval-canary.js';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const DOCS = 'd'.repeat(40);
const FIXTURES = 'e'.repeat(40);
const BLOB = '4f4dfca92a741c45b6f7628e7c8d6b5e6c578f85';
const COMMIT = { sha: HEAD, tree: { sha: TREE }, parents: [{ sha: BASE }] };
const COMPARE = {
  status: 'ahead',
  ahead_by: 1,
  behind_by: 0,
  total_commits: 1,
  base_commit: { sha: BASE },
  merge_base_commit: { sha: BASE },
  commits: [{ sha: HEAD }],
  files: [{ filename: P.path, status: 'added', sha: BLOB }],
};
const entries = (
  sha: string,
  path: string,
  child: string,
  type = 'tree',
  mode = '040000'
): unknown => ({ sha, truncated: false, tree: [{ path, sha: child, type, mode }] });
const fixture = (): Record<string, unknown> => ({
  [`git/commits/${HEAD}`]: COMMIT,
  [`compare/${BASE}...${HEAD}`]: COMPARE,
  [`git/trees/${TREE}`]: entries(TREE, 'docs', DOCS),
  [`git/trees/${DOCS}`]: entries(DOCS, 'fixtures', FIXTURES),
  [`git/trees/${FIXTURES}`]: entries(
    FIXTURES,
    'native-approval-canary.txt',
    BLOB,
    'blob',
    '100644'
  ),
  [`git/blobs/${BLOB}`]: {
    sha: BLOB,
    encoding: 'base64',
    size: Buffer.byteLength(P.content),
    content: Buffer.from(P.content).toString('base64'),
  },
});
const read = (data: Record<string, unknown>): Mock<CanaryRead> =>
  vi.fn((args: readonly string[]) => {
    const endpoint = args[3]?.replace('repos/nexus-substrate/nexus-agents/', '') ?? '';
    if (!(endpoint in data)) throw new Error('fixture-unexpected-endpoint');
    return Promise.resolve(data[endpoint]);
  });

describe('immutable canary file provenance', () => {
  it('measures the full direct-child diff and exact blob bytes', async () => {
    const result = await readCanaryFiles(read(fixture()), { headSha: HEAD, baseSha: BASE });
    expect(result).toMatchObject({
      commit: { complete: true, sha: HEAD, parents: [BASE], treeSha: TREE },
      files: {
        complete: true,
        treeSha: TREE,
        items: [
          { path: P.path, status: 'added', mode: '100644', content: P.content, blobSha: BLOB },
        ],
      },
    });
  });
  it.each([
    {
      name: 'truncated tree',
      endpoint: `git/trees/${TREE}`,
      value: { ...(entries(TREE, 'docs', DOCS) as object), truncated: true },
    },
    {
      name: 'missing tree',
      endpoint: `git/trees/${TREE}`,
      value: { sha: TREE, truncated: false, tree: [] },
    },
    {
      name: 'symlink directory',
      endpoint: `git/trees/${TREE}`,
      value: entries(TREE, 'docs', DOCS, 'blob', '120000'),
    },
    { name: 'wrong root', endpoint: `git/trees/${TREE}`, value: entries(HEAD, 'docs', DOCS) },
    {
      name: 'extra changed file',
      endpoint: `compare/${BASE}...${HEAD}`,
      value: {
        ...COMPARE,
        files: [...COMPARE.files, { filename: 'src/other.ts', status: 'added', sha: HEAD }],
      },
    },
    {
      name: 'incomplete commit diff',
      endpoint: `compare/${BASE}...${HEAD}`,
      value: { ...COMPARE, total_commits: 2 },
    },
    {
      name: 'stale merge-base',
      endpoint: `compare/${BASE}...${HEAD}`,
      value: { ...COMPARE, merge_base_commit: { sha: TREE } },
    },
    {
      name: 'wrong compare commit',
      endpoint: `compare/${BASE}...${HEAD}`,
      value: { ...COMPARE, commits: [{ sha: TREE }] },
    },
    {
      name: 'another parent',
      endpoint: `git/commits/${HEAD}`,
      value: { ...COMMIT, parents: [{ sha: TREE }] },
    },
    {
      name: 'different blob',
      endpoint: `git/blobs/${BLOB}`,
      value: {
        sha: BLOB,
        encoding: 'base64',
        size: 5,
        content: Buffer.from('wrong').toString('base64'),
      },
    },
    {
      name: 'malformed base64',
      endpoint: `git/blobs/${BLOB}`,
      value: { sha: BLOB, encoding: 'base64', size: 1, content: '???' },
    },
  ])('refuses $name', async ({ endpoint, value }) => {
    const data = fixture();
    data[endpoint] = value;
    await expect(readCanaryFiles(read(data), { headSha: HEAD, baseSha: BASE })).rejects.toThrow();
  });
});
