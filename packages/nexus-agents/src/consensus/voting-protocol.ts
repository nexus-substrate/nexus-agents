/**
 * Multi-Round Voting Protocol Implementation
 *
 * Implements a structured 3-round voting protocol for multi-agent code review
 * based on research showing 91.7-100% success rates vs 78% single-agent baseline.
 *
 * @module consensus/voting-protocol
 * (Source: Issue #100, arXiv:2512.21352 - Multi-Agent Committees)
 * (Source: arXiv:2509.23055 - Sycophancy Prevention)
 */

import { createLogger } from '../core/logger.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type {
  IVotingProtocol,
  VotingSession,
  VotingRound,
  VotingProtocolConfig,
  VotingProtocolResult,
  AgentFinding,
  FindingVote,
  Vote,
  SycophancyReport,
} from './types.js';
import {
  AgentFindingSchema,
  FindingVoteSchema,
  VoteSchema,
  DEFAULT_VOTING_PROTOCOL_CONFIG,
} from './types.js';
import {
  generateSessionId,
  generateFindingId,
  createRound,
  consolidateFindings,
  buildRoundSummaries,
  determineOutcome,
  calculateAgreementScore,
  detectSycophancyPatterns,
} from './voting-protocol-helpers.js';

const logger: ILogger = createLogger({ component: 'voting-protocol' });

/**
 * Multi-round voting protocol for code review.
 */
export class VotingProtocol implements IVotingProtocol {
  private readonly sessions: Map<string, VotingSession> = new Map();
  private readonly logger: ILogger;

  constructor(customLogger?: ILogger) {
    this.logger = customLogger ?? logger;
  }

  /**
   * Create a new voting session with a committee.
   */
  createSession(
    topic: string,
    committee: string[],
    config?: Partial<VotingProtocolConfig>
  ): VotingSession {
    const sessionConfig = { ...DEFAULT_VOTING_PROTOCOL_CONFIG, ...config };

    if (committee.length < 2) {
      throw new Error('Committee must have at least 2 members');
    }

    if (committee.length > sessionConfig.committeeSize) {
      throw new Error(`Committee size exceeds maximum (${String(sessionConfig.committeeSize)})`);
    }

    const session: VotingSession = {
      id: generateSessionId(),
      topic,
      committee,
      rounds: [],
      currentRound: 0,
      config: sessionConfig,
      status: 'active',
      createdAt: new Date(getTimeProvider().now()).toISOString(),
    };

    this.sessions.set(session.id, session);
    this.logger.info('Voting session created', {
      sessionId: session.id,
      topic,
      committeeSize: committee.length,
    });

    return session;
  }

  /**
   * Start the analysis round (Round 1).
   */
  startAnalysisRound(sessionId: string): Promise<VotingRound> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    if (session.currentRound !== 0) {
      return Promise.reject(new Error('Analysis round can only be started as Round 1'));
    }

    const round = createRound('analysis', 1);
    session.rounds.push(round);
    session.currentRound = 1;

    this.logger.info('Analysis round started', { sessionId, roundId: round.id });
    return Promise.resolve(round);
  }

  /**
   * Submit findings from an agent during analysis.
   */
  submitFindings(sessionId: string, agentId: string, findings: AgentFinding[]): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    const currentRound = this.getCurrentRound(session);
    if (currentRound.phase !== 'analysis') {
      return Promise.reject(new Error('Findings can only be submitted during analysis round'));
    }

    if (!session.committee.includes(agentId)) {
      return Promise.reject(new Error(`Agent ${agentId} is not a committee member`));
    }

    for (const finding of findings) {
      const validation = AgentFindingSchema.safeParse(finding);
      if (!validation.success) {
        return Promise.reject(new Error(`Invalid finding: ${validation.error.message}`));
      }

      const findingId = generateFindingId();
      const timestampedFinding = {
        ...validation.data,
        agentId,
        timestamp: new Date(getTimeProvider().now()).toISOString(),
      };
      currentRound.findings.set(findingId, timestampedFinding);
    }

    this.logger.debug('Findings submitted', { sessionId, agentId, findingsCount: findings.length });
    return Promise.resolve();
  }

  /**
   * Start the deliberation round (Round 2).
   */
  startDeliberationRound(sessionId: string): Promise<VotingRound> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    if (session.currentRound !== 1) {
      return Promise.reject(new Error('Deliberation round can only be started after analysis'));
    }

    const analysisRound = session.rounds[0];
    if (analysisRound) {
      analysisRound.status = 'completed';
      analysisRound.completedAt = new Date(getTimeProvider().now()).toISOString();
    }

    if (session.config.enableAntiSycophancy) {
      const report = this.detectSycophancy(sessionId);
      if (report.detected) {
        this.logger.warn('Sycophancy detected before deliberation', {
          sessionId,
          indicators: report.indicators.length,
        });
      }
    }

    const round = createRound('deliberation', 2);
    if (analysisRound) {
      analysisRound.findings.forEach((finding, id) => {
        round.findings.set(id, finding);
        round.findingVotes.set(id, []);
      });
    }

    session.rounds.push(round);
    session.currentRound = 2;

    this.logger.info('Deliberation round started', {
      sessionId,
      roundId: round.id,
      findingsCount: round.findings.size,
    });
    return Promise.resolve(round);
  }

  /**
   * Vote on findings during deliberation.
   */
  voteOnFinding(sessionId: string, vote: FindingVote): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    const currentRound = this.getCurrentRound(session);
    if (currentRound.phase !== 'deliberation') {
      return Promise.reject(new Error('Finding votes can only be submitted during deliberation'));
    }

    const validation = FindingVoteSchema.safeParse(vote);
    if (!validation.success) {
      return Promise.reject(new Error(`Invalid vote: ${validation.error.message}`));
    }

    if (!session.committee.includes(vote.agentId)) {
      return Promise.reject(new Error(`Agent ${vote.agentId} is not a committee member`));
    }

    if (!currentRound.findings.has(vote.findingId)) {
      return Promise.reject(new Error(`Finding ${vote.findingId} not found`));
    }

    const existingVotes = currentRound.findingVotes.get(vote.findingId) ?? [];
    const filtered = existingVotes.filter((v) => v.agentId !== vote.agentId);
    filtered.push(validation.data);
    currentRound.findingVotes.set(vote.findingId, filtered);

    this.logger.debug('Finding vote recorded', {
      sessionId,
      agentId: vote.agentId,
      findingId: vote.findingId,
      agree: vote.agree,
    });
    return Promise.resolve();
  }

  /**
   * Start the consensus round (Round 3).
   */
  startConsensusRound(sessionId: string): Promise<VotingRound> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    if (session.currentRound !== 2) {
      return Promise.reject(new Error('Consensus round can only be started after deliberation'));
    }

    const deliberationRound = session.rounds[1];
    if (deliberationRound) {
      deliberationRound.status = 'completed';
      deliberationRound.completedAt = new Date(getTimeProvider().now()).toISOString();
    }

    const round = createRound('consensus', 3);
    session.rounds.push(round);
    session.currentRound = 3;

    this.logger.info('Consensus round started', { sessionId, roundId: round.id });
    return Promise.resolve(round);
  }

  /**
   * Submit final vote during consensus.
   */
  submitFinalVote(sessionId: string, agentId: string, vote: Vote): Promise<void> {
    const session = this.getSessionOrThrow(sessionId);
    this.validateSessionActive(session);

    const currentRound = this.getCurrentRound(session);
    if (currentRound.phase !== 'consensus') {
      return Promise.reject(new Error('Final votes can only be submitted during consensus'));
    }

    const validation = VoteSchema.safeParse(vote);
    if (!validation.success) {
      return Promise.reject(new Error(`Invalid vote: ${validation.error.message}`));
    }

    if (!session.committee.includes(agentId)) {
      return Promise.reject(new Error(`Agent ${agentId} is not a committee member`));
    }

    currentRound.finalVotes.set(agentId, {
      ...validation.data,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
    });

    this.logger.debug('Final vote recorded', {
      sessionId,
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
    });
    return Promise.resolve();
  }

  /**
   * Get the final result.
   */
  getResult(sessionId: string): Promise<VotingProtocolResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return Promise.resolve(null);

    if (session.status === 'completed' && session.finalResult) {
      return Promise.resolve(session.finalResult);
    }

    if (session.currentRound < 3) return Promise.resolve(null);

    const consensusRound = session.rounds[2];
    if (!consensusRound) return Promise.resolve(null);

    const allVoted = session.committee.every((agentId) => consensusRound.finalVotes.has(agentId));
    if (!allVoted) return Promise.resolve(null);

    const result = this.buildFinalResult(session);
    session.finalResult = result;
    session.status = 'completed';
    session.completedAt = new Date(getTimeProvider().now()).toISOString();

    consensusRound.status = 'completed';
    consensusRound.completedAt = new Date(getTimeProvider().now()).toISOString();

    this.logger.info('Voting session completed', {
      sessionId,
      outcome: result.outcome,
      agreementScore: result.agreementScore,
      consolidatedFindings: result.consolidatedFindings.length,
    });

    return Promise.resolve(result);
  }

  /**
   * Detect sycophancy patterns.
   */
  detectSycophancy(sessionId: string): SycophancyReport {
    const session = this.getSessionOrThrow(sessionId);
    return detectSycophancyPatterns(session);
  }

  /**
   * Get the current session state.
   */
  getSession(sessionId: string): VotingSession | undefined {
    return this.sessions.get(sessionId);
  }

  private getSessionOrThrow(sessionId: string): VotingSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  private validateSessionActive(session: VotingSession): void {
    if (session.status !== 'active') {
      throw new Error(`Session ${session.id} is ${session.status}`);
    }
  }

  private getCurrentRound(session: VotingSession): VotingRound {
    const round = session.rounds[session.currentRound - 1];
    if (!round) {
      throw new Error(`No round ${String(session.currentRound)} found`);
    }
    return round;
  }

  private buildFinalResult(session: VotingSession): VotingProtocolResult {
    const startTime = new Date(session.createdAt).getTime();
    const endTime = getTimeProvider().now();

    const consolidatedFindingsList = consolidateFindings(session);
    const roundSummaries = buildRoundSummaries(session);

    const consensusRound = session.rounds[2];
    const finalVotes = consensusRound ? Array.from(consensusRound.finalVotes.values()) : [];
    const outcome = determineOutcome(finalVotes, session.config);
    const agreementScore = calculateAgreementScore(finalVotes);
    const sycophancyReport = detectSycophancyPatterns(session);

    return {
      sessionId: session.id,
      topic: session.topic,
      outcome,
      consolidatedFindings: consolidatedFindingsList,
      roundSummaries,
      agreementScore,
      sycophancyDetected: sycophancyReport.detected,
      totalDurationMs: endTime - startTime,
      participatingAgents: session.committee,
    };
  }
}

/**
 * Create a voting protocol instance.
 */
export function createVotingProtocol(customLogger?: ILogger): VotingProtocol {
  return new VotingProtocol(customLogger);
}
