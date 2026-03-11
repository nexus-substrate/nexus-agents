/**
 * Tests for multi-round voting protocol.
 * (Source: Issue #100, arXiv:2512.21352)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VotingProtocol, createVotingProtocol } from './voting-protocol.js';
import type { AgentFinding, FindingVote, Vote } from './types.js';

// Helper to submit agreement votes from multiple agents
async function submitAgreementVotes(
  protocol: VotingProtocol,
  sessionId: string,
  agentIds: string[],
  findingId: string
): Promise<void> {
  for (const agentId of agentIds) {
    await protocol.voteOnFinding(sessionId, {
      agentId,
      findingId,
      agree: true,
      reasoning: 'Confirmed',
    });
  }
}

// Helper to submit final votes from all committee members
async function submitAllFinalVotes(
  protocol: VotingProtocol,
  sessionId: string,
  committee: string[],
  vote: Vote
): Promise<void> {
  for (const agentId of committee) {
    await protocol.submitFinalVote(sessionId, agentId, vote);
  }
}

describe('VotingProtocol', () => {
  let protocol: VotingProtocol;
  const committee = ['agent-1', 'agent-2', 'agent-3'];
  const topic = 'Review PR #123: Add user authentication';

  beforeEach(() => {
    protocol = new VotingProtocol();
  });

  describe('createSession', () => {
    it('should create a new voting session', () => {
      const session = protocol.createSession(topic, committee);

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_/);
      expect(session.topic).toBe(topic);
      expect(session.committee).toEqual(committee);
      expect(session.status).toBe('active');
      expect(session.currentRound).toBe(0);
      expect(session.rounds).toHaveLength(0);
    });

    it('should throw if committee has less than 2 members', () => {
      expect(() => protocol.createSession(topic, ['agent-1'])).toThrow(
        'Committee must have at least 2 members'
      );
    });

    it('should accept custom configuration', () => {
      const session = protocol.createSession(topic, committee, {
        agreementThreshold: 0.8,
        maxRounds: 5,
      });

      expect(session.config.agreementThreshold).toBe(0.8);
      expect(session.config.maxRounds).toBe(5);
    });
  });

  describe('Analysis Round (Round 1)', () => {
    it('should start analysis round', async () => {
      const session = protocol.createSession(topic, committee);
      const round = await protocol.startAnalysisRound(session.id);

      expect(round.phase).toBe('analysis');
      expect(round.roundNumber).toBe(1);
      expect(round.status).toBe('in_progress');
    });

    it('should throw if analysis round already started', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      await expect(protocol.startAnalysisRound(session.id)).rejects.toThrow(
        'Analysis round can only be started as Round 1'
      );
    });

    it('should accept findings from committee members', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      const findings: AgentFinding[] = [
        {
          agentId: 'agent-1',
          category: 'security',
          severity: 'major',
          description: 'SQL injection vulnerability in login handler',
          location: 'src/auth/login.ts:45',
          suggestion: 'Use parameterized queries',
          confidence: 0.9,
        },
      ];

      await protocol.submitFindings(session.id, 'agent-1', findings);

      const updatedSession = protocol.getSession(session.id);
      expect(updatedSession?.rounds[0]?.findings.size).toBe(1);
    });

    it('should reject findings from non-committee members', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      const findings: AgentFinding[] = [
        {
          agentId: 'outsider',
          category: 'bug',
          severity: 'minor',
          description: 'Test finding',
          confidence: 0.5,
        },
      ];

      await expect(protocol.submitFindings(session.id, 'outsider', findings)).rejects.toThrow(
        'Agent outsider is not a committee member'
      );
    });
  });

  describe('Deliberation Round (Round 2)', () => {
    it('should start deliberation round with findings from analysis', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      // Submit findings
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'major',
          description: 'Null pointer exception',
          confidence: 0.85,
        },
      ]);

      const round = await protocol.startDeliberationRound(session.id);

      expect(round.phase).toBe('deliberation');
      expect(round.roundNumber).toBe(2);
      expect(round.findings.size).toBe(1);
    });

    it('should accept votes on findings', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'major',
          description: 'Null pointer exception',
          confidence: 0.85,
        },
      ]);

      await protocol.startDeliberationRound(session.id);

      const updatedSession = protocol.getSession(session.id);
      const findingId = Array.from(updatedSession?.rounds[1]?.findings.keys() ?? [])[0];

      const vote: FindingVote = {
        agentId: 'agent-2',
        findingId: findingId!,
        agree: true,
        reasoning: 'Confirmed the bug exists',
      };

      await protocol.voteOnFinding(session.id, vote);

      const sessionAfterVote = protocol.getSession(session.id);
      const votes = sessionAfterVote?.rounds[1]?.findingVotes.get(findingId!);
      expect(votes).toHaveLength(1);
      expect(votes![0]!.agree).toBe(true);
    });
  });

  describe('Consensus Round (Round 3)', () => {
    it('should start consensus round', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      const round = await protocol.startConsensusRound(session.id);

      expect(round.phase).toBe('consensus');
      expect(round.roundNumber).toBe(3);
    });

    it('should accept final votes', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      const vote: Vote = {
        decision: 'approve',
        reasoning: 'Code looks good after addressing findings',
        confidence: 0.9,
      };

      await protocol.submitFinalVote(session.id, 'agent-1', vote);

      const updatedSession = protocol.getSession(session.id);
      expect(updatedSession?.rounds[2]?.finalVotes.has('agent-1')).toBe(true);
    });
  });

  describe('Final Result', () => {
    it('should return null if voting not complete', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      const result = await protocol.getResult(session.id);
      expect(result).toBeNull();
    });

    it('should return approved result when majority approves', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      // All agents approve
      for (const agentId of committee) {
        await protocol.submitFinalVote(session.id, agentId, {
          decision: 'approve',
          reasoning: 'Looks good',
          confidence: 0.85,
        });
      }

      const result = await protocol.getResult(session.id);

      expect(result).not.toBeNull();
      expect(result?.outcome).toBe('approved');
      expect(result?.agreementScore).toBe(1);
      expect(result?.participatingAgents).toEqual(committee);
    });

    it('should return rejected result when majority rejects', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      // All agents reject
      for (const agentId of committee) {
        await protocol.submitFinalVote(session.id, agentId, {
          decision: 'reject',
          reasoning: 'Critical issues found',
          confidence: 0.9,
        });
      }

      const result = await protocol.getResult(session.id);

      expect(result).not.toBeNull();
      expect(result?.outcome).toBe('rejected');
    });

    it('should return needs_revision when mixed votes', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      await protocol.submitFinalVote(session.id, 'agent-1', {
        decision: 'approve',
        reasoning: 'Minor issues only',
        confidence: 0.7,
      });
      await protocol.submitFinalVote(session.id, 'agent-2', {
        decision: 'reject',
        reasoning: 'Major issues',
        confidence: 0.8,
      });
      await protocol.submitFinalVote(session.id, 'agent-3', {
        decision: 'abstain',
        reasoning: 'Need more info',
        confidence: 0.5,
      });

      const result = await protocol.getResult(session.id);

      expect(result).not.toBeNull();
      expect(result?.outcome).toBe('needs_revision');
    });

    it('should consolidate findings with agreement', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      // Submit security finding
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'security',
          severity: 'critical',
          description: 'SQL injection vulnerability',
          location: 'src/db.ts:10',
          confidence: 0.95,
        },
      ]);

      await protocol.startDeliberationRound(session.id);

      // Get finding ID and submit agreement votes
      const currentSession = protocol.getSession(session.id);
      const findingId = Array.from(currentSession?.rounds[1]?.findings.keys() ?? [])[0];
      await submitAgreementVotes(protocol, session.id, ['agent-2', 'agent-3'], findingId!);

      // Submit final votes from all committee members
      await protocol.startConsensusRound(session.id);
      await submitAllFinalVotes(protocol, session.id, committee, {
        decision: 'reject',
        reasoning: 'Critical security issue',
        confidence: 0.9,
      });

      const result = await protocol.getResult(session.id);

      expect(result?.consolidatedFindings.length).toBe(1);
      expect(result?.consolidatedFindings[0]?.agreementRatio).toBe(1);
      expect(result?.consolidatedFindings[0]?.severity).toBe('critical');
    });
  });

  describe('Sycophancy Detection', () => {
    it('should not detect sycophancy with normal voting', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      // Submit varied findings
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'minor',
          description: 'Minor issue',
          confidence: 0.6,
        },
      ]);
      await protocol.submitFindings(session.id, 'agent-2', [
        {
          agentId: 'agent-2',
          category: 'style',
          severity: 'suggestion',
          description: 'Style improvement',
          confidence: 0.7,
        },
      ]);

      const report = protocol.detectSycophancy(session.id);
      expect(report.detected).toBe(false);
    });

    it('should detect premature consensus with high confidence', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      // All agents submit similar findings with very high confidence
      for (const agentId of committee) {
        await protocol.submitFindings(session.id, agentId, [
          {
            agentId,
            category: 'bug',
            severity: 'major',
            description: 'Same issue',
            confidence: 0.99, // Suspiciously high
          },
        ]);
      }

      const report = protocol.detectSycophancy(session.id);
      expect(report.detected).toBe(true);
      expect(report.indicators.some((i) => i.type === 'premature_consensus')).toBe(true);
    });

    it('should detect opinion convergence in deliberation', async () => {
      const session = protocol.createSession(topic, committee, {
        sycophancyThreshold: 0.7, // Lower threshold for test
      });
      await protocol.startAnalysisRound(session.id);

      // Submit multiple findings
      for (let i = 0; i < 3; i++) {
        await protocol.submitFindings(session.id, 'agent-1', [
          {
            agentId: 'agent-1',
            category: 'bug',
            severity: 'minor',
            description: `Finding ${String(i)}`,
            confidence: 0.7,
          },
        ]);
      }

      await protocol.startDeliberationRound(session.id);

      // Everyone agrees on everything
      const currentSession = protocol.getSession(session.id);
      const findingIds = Array.from(currentSession?.rounds[1]?.findings.keys() ?? []);

      for (const findingId of findingIds) {
        for (const agentId of ['agent-2', 'agent-3']) {
          await protocol.voteOnFinding(session.id, {
            agentId,
            findingId,
            agree: true,
          });
        }
      }

      const report = protocol.detectSycophancy(session.id);
      expect(report.detected).toBe(true);
      expect(report.indicators.some((i) => i.type === 'opinion_convergence')).toBe(true);
    });
  });

  describe('getResult edge cases', () => {
    it('should return null for non-existent session', async () => {
      const result = await protocol.getResult('non-existent-id');
      expect(result).toBeNull();
    });

    it('should return cached result for already completed session', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      for (const agentId of committee) {
        await protocol.submitFinalVote(session.id, agentId, {
          decision: 'approve',
          reasoning: 'Looks good',
          confidence: 0.85,
        });
      }

      const result1 = await protocol.getResult(session.id);
      const result2 = await protocol.getResult(session.id);
      expect(result1).toBe(result2); // Same reference — cached
    });

    it('should return null when not all committee members have voted', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      await protocol.submitFinalVote(session.id, 'agent-1', {
        decision: 'approve',
        reasoning: 'Ok',
        confidence: 0.8,
      });

      const result = await protocol.getResult(session.id);
      expect(result).toBeNull();
    });
  });

  describe('Error branches', () => {
    it('should reject submitFindings during wrong phase', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);

      await expect(
        protocol.submitFindings(session.id, 'agent-1', [
          {
            agentId: 'agent-1',
            category: 'bug',
            severity: 'minor',
            description: 'x',
            confidence: 0.5,
          },
        ])
      ).rejects.toThrow('Findings can only be submitted during analysis round');
    });

    it('should reject voteOnFinding during wrong phase', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      await expect(
        protocol.voteOnFinding(session.id, {
          agentId: 'agent-1',
          findingId: 'finding-1',
          agree: true,
        })
      ).rejects.toThrow('Finding votes can only be submitted during deliberation');
    });

    it('should reject voteOnFinding from non-committee member', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'minor',
          description: 'x',
          confidence: 0.5,
        },
      ]);
      await protocol.startDeliberationRound(session.id);

      const findingId = Array.from(
        protocol.getSession(session.id)?.rounds[1]?.findings.keys() ?? []
      )[0];

      await expect(
        protocol.voteOnFinding(session.id, {
          agentId: 'outsider',
          findingId: findingId!,
          agree: true,
        })
      ).rejects.toThrow('Agent outsider is not a committee member');
    });

    it('should reject voteOnFinding for non-existent finding', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'minor',
          description: 'x',
          confidence: 0.5,
        },
      ]);
      await protocol.startDeliberationRound(session.id);

      await expect(
        protocol.voteOnFinding(session.id, {
          agentId: 'agent-1',
          findingId: 'non-existent-finding',
          agree: true,
        })
      ).rejects.toThrow('Finding non-existent-finding not found');
    });

    it('should reject submitFinalVote during wrong phase', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      await expect(
        protocol.submitFinalVote(session.id, 'agent-1', {
          decision: 'approve',
          reasoning: 'Ok',
          confidence: 0.8,
        })
      ).rejects.toThrow('Final votes can only be submitted during consensus');
    });

    it('should reject submitFinalVote from non-committee member', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      await expect(
        protocol.submitFinalVote(session.id, 'outsider', {
          decision: 'approve',
          reasoning: 'Ok',
          confidence: 0.8,
        })
      ).rejects.toThrow('Agent outsider is not a committee member');
    });

    it('should reject startDeliberationRound when not in round 1', async () => {
      const session = protocol.createSession(topic, committee);

      await expect(protocol.startDeliberationRound(session.id)).rejects.toThrow(
        'Deliberation round can only be started after analysis'
      );
    });

    it('should reject startConsensusRound when not in round 2', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);

      await expect(protocol.startConsensusRound(session.id)).rejects.toThrow(
        'Consensus round can only be started after deliberation'
      );
    });

    it('should throw when operating on completed session', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.startDeliberationRound(session.id);
      await protocol.startConsensusRound(session.id);

      for (const agentId of committee) {
        await protocol.submitFinalVote(session.id, agentId, {
          decision: 'approve',
          reasoning: 'Ok',
          confidence: 0.8,
        });
      }

      await protocol.getResult(session.id); // completes the session

      expect(() => protocol.startAnalysisRound(session.id)).toThrow('is completed');
    });

    it('should replace duplicate finding vote from same agent', async () => {
      const session = protocol.createSession(topic, committee);
      await protocol.startAnalysisRound(session.id);
      await protocol.submitFindings(session.id, 'agent-1', [
        {
          agentId: 'agent-1',
          category: 'bug',
          severity: 'minor',
          description: 'x',
          confidence: 0.5,
        },
      ]);
      await protocol.startDeliberationRound(session.id);

      const findingId = Array.from(
        protocol.getSession(session.id)?.rounds[1]?.findings.keys() ?? []
      )[0]!;

      // Vote twice — second should replace first
      await protocol.voteOnFinding(session.id, {
        agentId: 'agent-2',
        findingId,
        agree: true,
        reasoning: 'First vote',
      });
      await protocol.voteOnFinding(session.id, {
        agentId: 'agent-2',
        findingId,
        agree: false,
        reasoning: 'Changed mind',
      });

      const votes = protocol.getSession(session.id)?.rounds[1]?.findingVotes.get(findingId);
      expect(votes).toHaveLength(1);
      expect(votes![0]!.agree).toBe(false);
    });
  });

  describe('Anti-sycophancy in deliberation', () => {
    it('should detect sycophancy when starting deliberation with enableAntiSycophancy', async () => {
      const session = protocol.createSession(topic, committee, {
        enableAntiSycophancy: true,
        sycophancyThreshold: 0.5,
      });
      await protocol.startAnalysisRound(session.id);

      // All agents submit identical high-confidence findings
      for (const agentId of committee) {
        await protocol.submitFindings(session.id, agentId, [
          { agentId, category: 'bug', severity: 'major', description: 'Same', confidence: 0.99 },
        ]);
      }

      // Should not throw — sycophancy detection is logged, not blocking
      const round = await protocol.startDeliberationRound(session.id);
      expect(round.phase).toBe('deliberation');
    });
  });

  describe('createVotingProtocol', () => {
    it('should create a VotingProtocol instance', () => {
      const protocol = createVotingProtocol();
      expect(protocol).toBeInstanceOf(VotingProtocol);
    });
  });

  describe('Edge Cases', () => {
    let protocol: VotingProtocol;

    beforeEach(() => {
      protocol = new VotingProtocol();
    });

    describe('Session Management Edge Cases', () => {
      it('should throw for non-existent session', () => {
        // startAnalysisRound throws synchronously
        expect(() => protocol.startAnalysisRound('non-existent')).toThrow('not found');
      });

      it('should handle duplicate session IDs gracefully', () => {
        const committee = ['agent-1', 'agent-2'];
        const session1 = protocol.createSession('Topic 1', committee);

        // Creating another session should generate a different ID
        const session2 = protocol.createSession('Topic 2', committee);

        expect(session1.id).not.toBe(session2.id);
      });

      it('should throw for committee exceeding maximum size', () => {
        // Default committee size is 3, so 20 should exceed it
        const largeCommittee = Array.from({ length: 20 }, (_, i) => `agent-${String(i)}`);
        expect(() => protocol.createSession('Large committee test', largeCommittee)).toThrow(
          'Committee size exceeds maximum'
        );
      });

      it('should handle committee with exactly 2 members (minimum)', () => {
        const minCommittee = ['agent-1', 'agent-2'];
        const session = protocol.createSession('Minimum committee', minCommittee);

        expect(session.committee).toHaveLength(2);
      });

      it('should handle committee at maximum size (3)', () => {
        const maxCommittee = ['agent-1', 'agent-2', 'agent-3'];
        const session = protocol.createSession('Max committee', maxCommittee);

        expect(session.committee).toHaveLength(3);
      });
    });

    describe('Finding Submission Edge Cases', () => {
      it('should handle empty findings array', async () => {
        const session = protocol.createSession('Topic', ['agent-1', 'agent-2']);
        await protocol.startAnalysisRound(session.id);

        await protocol.submitFindings(session.id, 'agent-1', []);

        const updatedSession = protocol.getSession(session.id);
        expect(updatedSession?.rounds[0]?.findings.size).toBe(0);
      });

      it('should handle findings with very high confidence', async () => {
        const session = protocol.createSession('Topic', ['agent-1', 'agent-2']);
        await protocol.startAnalysisRound(session.id);

        const highConfidenceFindings: AgentFinding[] = [
          {
            agentId: 'agent-1',
            category: 'security',
            severity: 'critical',
            description: 'Absolutely certain vulnerability',
            confidence: 1.0,
          },
        ];

        await protocol.submitFindings(session.id, 'agent-1', highConfidenceFindings);

        const updatedSession = protocol.getSession(session.id);
        expect(updatedSession?.rounds[0]?.findings.size).toBe(1);
      });

      it('should handle findings with very low confidence', async () => {
        const session = protocol.createSession('Topic', ['agent-1', 'agent-2']);
        await protocol.startAnalysisRound(session.id);

        const lowConfidenceFindings: AgentFinding[] = [
          {
            agentId: 'agent-1',
            category: 'style',
            severity: 'suggestion',
            description: 'Very uncertain observation',
            confidence: 0.1,
          },
        ];

        await protocol.submitFindings(session.id, 'agent-1', lowConfidenceFindings);

        const updatedSession = protocol.getSession(session.id);
        expect(updatedSession?.rounds[0]?.findings.size).toBe(1);
      });
    });

    describe('Voting Edge Cases', () => {
      it('should handle unanimous abstention in final voting', async () => {
        const committee = ['agent-1', 'agent-2', 'agent-3'];
        const session = protocol.createSession('Topic', committee);
        await protocol.startAnalysisRound(session.id);
        await protocol.startDeliberationRound(session.id);
        await protocol.startConsensusRound(session.id);

        // All agents abstain
        for (const agentId of committee) {
          await protocol.submitFinalVote(session.id, agentId, {
            decision: 'abstain',
            reasoning: 'Need more information',
            confidence: 0.3,
          });
        }

        const result = await protocol.getResult(session.id);

        expect(result).not.toBeNull();
        // When all abstain, outcome is 'no_consensus' per implementation
        expect(result?.outcome).toBe('no_consensus');
      });

      it('should handle partial committee voting (not all vote)', async () => {
        const committee = ['agent-1', 'agent-2', 'agent-3'];
        const session = protocol.createSession('Topic', committee);
        await protocol.startAnalysisRound(session.id);
        await protocol.startDeliberationRound(session.id);
        await protocol.startConsensusRound(session.id);

        // Only agent-1 votes
        await protocol.submitFinalVote(session.id, 'agent-1', {
          decision: 'approve',
          reasoning: 'Looks good',
          confidence: 0.9,
        });

        // Result should still be retrievable
        const updatedSession = protocol.getSession(session.id);
        expect(updatedSession?.rounds[2]?.finalVotes.size).toBe(1);
      });
    });

    describe('Finding Vote Edge Cases', () => {
      it('should handle voting on finding by same agent who submitted it', async () => {
        const session = protocol.createSession('Topic', ['agent-1', 'agent-2']);
        await protocol.startAnalysisRound(session.id);

        await protocol.submitFindings(session.id, 'agent-1', [
          {
            agentId: 'agent-1',
            category: 'bug',
            severity: 'major',
            description: 'Found a bug',
            confidence: 0.8,
          },
        ]);

        await protocol.startDeliberationRound(session.id);

        const currentSession = protocol.getSession(session.id);
        const findingId = Array.from(currentSession?.rounds[1]?.findings.keys() ?? [])[0];

        // Agent-1 votes on their own finding
        const vote: FindingVote = {
          agentId: 'agent-1',
          findingId: findingId!,
          agree: true,
          reasoning: 'I confirm my own finding',
        };

        await protocol.voteOnFinding(session.id, vote);

        const sessionAfterVote = protocol.getSession(session.id);
        const votes = sessionAfterVote?.rounds[1]?.findingVotes.get(findingId!);
        expect(votes).toHaveLength(1);
      });
    });

    describe('Agreement Calculation Edge Cases', () => {
      it('should calculate 100% agreement when all agree', async () => {
        const committee = ['agent-1', 'agent-2', 'agent-3'];
        const session = protocol.createSession('Topic', committee);
        await protocol.startAnalysisRound(session.id);

        await protocol.submitFindings(session.id, 'agent-1', [
          {
            agentId: 'agent-1',
            category: 'bug',
            severity: 'major',
            description: 'Critical bug',
            confidence: 0.9,
          },
        ]);

        await protocol.startDeliberationRound(session.id);

        const currentSession = protocol.getSession(session.id);
        const findingId = Array.from(currentSession?.rounds[1]?.findings.keys() ?? [])[0];

        // All committee members agree
        for (const agentId of ['agent-2', 'agent-3']) {
          await protocol.voteOnFinding(session.id, {
            agentId,
            findingId: findingId!,
            agree: true,
            reasoning: 'Confirmed',
          });
        }

        await protocol.startConsensusRound(session.id);
        await submitAllFinalVotes(protocol, session.id, committee, {
          decision: 'reject',
          reasoning: 'Critical bug found',
          confidence: 0.9,
        });

        const result = await protocol.getResult(session.id);

        expect(result?.consolidatedFindings[0]?.agreementRatio).toBe(1);
      });

      it('should calculate 0% agreement when all disagree', async () => {
        const committee = ['agent-1', 'agent-2', 'agent-3'];
        const session = protocol.createSession('Topic', committee);
        await protocol.startAnalysisRound(session.id);

        await protocol.submitFindings(session.id, 'agent-1', [
          {
            agentId: 'agent-1',
            category: 'style',
            severity: 'minor',
            description: 'Style issue',
            confidence: 0.5,
          },
        ]);

        await protocol.startDeliberationRound(session.id);

        const currentSession = protocol.getSession(session.id);
        const findingId = Array.from(currentSession?.rounds[1]?.findings.keys() ?? [])[0];

        // All other committee members disagree
        for (const agentId of ['agent-2', 'agent-3']) {
          await protocol.voteOnFinding(session.id, {
            agentId,
            findingId: findingId!,
            agree: false,
            reasoning: 'Disagree with this finding',
          });
        }

        await protocol.startConsensusRound(session.id);
        await submitAllFinalVotes(protocol, session.id, committee, {
          decision: 'approve',
          reasoning: 'Finding was not valid',
          confidence: 0.8,
        });

        const result = await protocol.getResult(session.id);

        // When all disagree, agreementRatio is 0
        // However, if the finding is filtered out due to low agreement, it may not appear
        const firstFinding = result?.consolidatedFindings[0];
        if (firstFinding) {
          expect(firstFinding.agreementRatio).toBe(0);
        } else {
          // Finding was filtered due to low agreement - this is valid behavior
          expect(result?.consolidatedFindings.length).toBe(0);
        }
      });
    });
  });
});
