/** Immutable git object evidence; never checks out or executes PR-controlled bytes. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { NATIVE_CANARY_POLICY as P } from './native-approval-canary.js';
import type { NativeCanaryEvidence } from './native-approval-canary.js';
import { CanarySha, readCanaryGet } from './native-approval-canary-read.js';
import type { CanaryRead } from './native-approval-canary-read.js';

const Identity = z.object({ sha: CanarySha });
const Commit = Identity.extend({ tree: Identity, parents: z.array(Identity).length(1) });
const Compare = z.object({
  status: z.literal('ahead'),
  ahead_by: z.literal(1),
  behind_by: z.literal(0),
  total_commits: z.literal(1),
  base_commit: Identity,
  merge_base_commit: Identity,
  commits: z.array(Identity).length(1),
  files: z
    .array(z.object({ filename: z.literal(P.path), status: z.literal('added'), sha: CanarySha }))
    .length(1),
});
const Entry = Identity.extend({
  path: z.string().min(1).max(1024),
  mode: z.string(),
  type: z.string(),
});
const Tree = Identity.extend({ truncated: z.literal(false), tree: z.array(Entry).max(10000) });
const Blob = Identity.extend({
  encoding: z.literal('base64'),
  size: z.number().int().min(0).max(1024),
  content: z.string().max(2048),
});

async function canaryTreeEntry(read: CanaryRead, root: string): Promise<z.infer<typeof Entry>> {
  let sha = root;
  const parts = P.path.split('/');
  for (const [index, path] of parts.entries()) {
    const tree = await readCanaryGet(read, `git/trees/${sha}`, Tree);
    if (tree.sha !== sha) throw new Error('tree-identity-mismatch');
    const hits = tree.tree.filter((entry) => entry.path === path);
    const entry = hits[0];
    if (hits.length !== 1 || entry === undefined) throw new Error('tree-path-unmeasured');
    if (index === parts.length - 1) {
      if (entry.type !== 'blob' || entry.mode !== '100644') throw new Error('file-mode-mismatch');
      return entry;
    }
    if (entry.type !== 'tree' || entry.mode !== '040000')
      throw new Error('directory-mode-mismatch');
    sha = entry.sha;
  }
  throw new Error('empty-canary-path');
}

async function canaryBlob(read: CanaryRead, sha: string): Promise<string> {
  const blob = await readCanaryGet(read, `git/blobs/${sha}`, Blob);
  const encoded = blob.content.replace(/\n/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  const hash = createHash('sha1')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');
  if (
    blob.sha !== sha ||
    bytes.length !== blob.size ||
    bytes.toString('base64') !== encoded ||
    hash !== sha
  ) {
    throw new Error('blob-integrity-mismatch');
  }
  const expected = Buffer.from(P.content);
  if (!bytes.equals(expected)) throw new Error('blob-content-mismatch');
  return bytes.toString('utf8');
}

/** GitHub's complete one-commit comparison plus git tree/blob identities cover the whole change. */
export async function readCanaryFiles(
  read: CanaryRead,
  expected: { headSha: string; baseSha: string }
): Promise<Pick<NativeCanaryEvidence, 'commit' | 'files'>> {
  const head = CanarySha.parse(expected.headSha);
  const base = CanarySha.parse(expected.baseSha);
  const commit = await readCanaryGet(read, `git/commits/${head}`, Commit);
  const compare = await readCanaryGet(read, `compare/${base}...${head}`, Compare);
  if (
    commit.sha !== head ||
    commit.parents[0]?.sha !== base ||
    compare.base_commit.sha !== base ||
    compare.merge_base_commit.sha !== base ||
    compare.commits[0]?.sha !== head
  ) {
    throw new Error('commit-ancestry-mismatch');
  }
  const entry = await canaryTreeEntry(read, commit.tree.sha);
  if (entry.sha !== compare.files[0]?.sha) throw new Error('compare-tree-mismatch');
  const content = await canaryBlob(read, entry.sha);
  return {
    commit: { complete: true, sha: head, parents: [base], treeSha: commit.tree.sha },
    files: {
      complete: true,
      treeSha: commit.tree.sha,
      items: [{ path: P.path, status: 'added', mode: entry.mode, content, blobSha: entry.sha }],
    },
  };
}
