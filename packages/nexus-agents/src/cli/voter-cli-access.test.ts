/**
 * #6962: voter seats run read-only analysis (#6754), so the CLI round-robin
 * deals seats only over CLIs that declare they enforce it. agy (the gemini
 * slot) does not since #6962, and every seat dealt to it refused.
 */
import { describe, it, expect, vi } from 'vitest';

import type { CliName } from '../cli-adapters/types.js';
import { clisServingVoterSeats, VOTER_ACCESS_MODE } from './voter-cli-access.js';

// The default reader builds real adapters; codex's factory probes the binary
// for its transport. Both transports declare the same modes.
vi.mock('../cli-adapters/codex-mcp-server-probe.js', () => ({
  codexMcpServerAvailable: () => true,
}));

const declares =
  (enforcing: readonly CliName[]) =>
  (cli: CliName): { enforcesReadOnlyAnalysis: boolean; enforcesWorkspaceEdit: boolean } => ({
    enforcesReadOnlyAnalysis: enforcing.includes(cli),
    enforcesWorkspaceEdit: false,
  });

describe('clisServingVoterSeats (#6962)', () => {
  it('voters ask for read-only analysis', () => {
    expect(VOTER_ACCESS_MODE).toBe('read-only-analysis');
  });

  it('drops a CLI that does not enforce read-only analysis, keeping order', () => {
    const result = clisServingVoterSeats(
      ['claude', 'gemini', 'codex', 'opencode'],
      declares(['claude', 'codex', 'opencode'])
    );
    expect(result.serving).toEqual(['claude', 'codex', 'opencode']);
    expect(result.refused).toEqual(['gemini']);
  });

  it('keeps every CLI when all enforce it', () => {
    const result = clisServingVoterSeats(['codex', 'claude'], declares(['claude', 'codex']));
    expect(result.serving).toEqual(['codex', 'claude']);
    expect(result.refused).toEqual([]);
  });

  it('serves no CLI when none enforces it (empty is not "all")', () => {
    const result = clisServingVoterSeats(['gemini'], declares([]));
    expect(result.serving).toEqual([]);
    expect(result.refused).toEqual(['gemini']);
  });

  it('an empty input serves nothing and refuses nothing', () => {
    expect(clisServingVoterSeats([], declares(['claude']))).toEqual({ serving: [], refused: [] });
  });

  it('reads the real adapter declarations by default: gemini and opencode refused (#6970)', () => {
    const result = clisServingVoterSeats(['claude', 'gemini', 'codex', 'opencode']);
    expect(result.refused).toEqual(['gemini', 'opencode']);
    expect(result.serving).toEqual(['claude', 'codex']);
  });
});
