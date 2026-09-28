/** Read-only persisted inputs for the weekly decision-cost report (#6809). */
import { existsSync } from 'node:fs';

import type { LinkedVote } from '../../observability/consensus-decision-tokens.js';
import { verifyVoteRecordSet } from '../../audit/vote-record.js';
import { readVoteRecords, resolveVoteRecordsPath } from '../../audit/vote-record-store.js';
import { isPersistenceEnabled } from '../../config/learning-persistence.js';
import {
  DecisionCostStore,
  type DecisionCostRecord,
} from '../../observability/decision-cost-store.js';

/** Use the injected snapshot or the existing durable cost store, within lookback. */
export function resolveWeatherDecisionCosts(
  windowMs: number,
  injected?: readonly DecisionCostRecord[]
): readonly DecisionCostRecord[] {
  if (injected !== undefined) return injected;
  if (!isPersistenceEnabled()) return [];
  const store = new DecisionCostStore();
  if (windowMs <= 0) return store.all();
  const since = new Date(Date.now() - windowMs).toISOString();
  return store.query({ since });
}

/** The caller supplies injected rows to avoid mixing a test snapshot with a host ledger. */
export function resolveWeatherVoteRecords(
  windowMs: number,
  injectedVotes?: readonly LinkedVote[],
  hasInjectedCosts = false
): readonly LinkedVote[] {
  if (injectedVotes !== undefined) return injectedVotes;
  if (hasInjectedCosts || !isPersistenceEnabled()) return [];
  const path = resolveVoteRecordsPath();
  if (path === undefined || !existsSync(path)) return [];
  const ledger = readVoteRecords(path);
  if (ledger.invalidLines.length > 0) throw new Error('invalid runtime vote ledger lines');
  if (!verifyVoteRecordSet(ledger.records, ledger.redactions).ok) {
    throw new Error('runtime vote ledger integrity check failed');
  }
  const { records } = ledger;
  if (windowMs <= 0) return records;
  const since = new Date(Date.now() - windowMs).toISOString();
  return records.filter((record) => record.recordedAt >= since);
}
