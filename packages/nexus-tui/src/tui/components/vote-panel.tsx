/**
 * VotePanel — Live consensus vote visualization.
 *
 * Shows role-by-role vote breakdown during a consensus vote.
 * Subscribes to vote results passed down as props.
 *
 * @module tui/components/vote-panel
 */

import React from 'react';
import { Box, Text } from 'ink';
import { formatBar } from '../../formatter.js';

interface VoteEntry {
  readonly role: string;
  readonly decision: 'APPROVE' | 'REJECT' | 'PENDING';
  readonly confidence: number;
}

interface ActiveVote {
  readonly proposal: string;
  readonly votes: readonly VoteEntry[];
  readonly outcome: string | null;
}

interface VotePanelProps {
  readonly activeVote: ActiveVote | null;
}

export function VotePanel({ activeVote }: VotePanelProps): React.ReactElement {
  if (activeVote === null) {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
        <Text bold color="magenta">
          Vote
        </Text>
        <Text dimColor>No active vote</Text>
      </Box>
    );
  }

  const maxRole = Math.max(...activeVote.votes.map((v) => v.role.length), 4);

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" paddingX={1}>
      <Text bold color="magenta">
        Vote
      </Text>
      <Text>{`Proposal: ${activeVote.proposal.slice(0, 50)}`}</Text>
      {activeVote.votes.map((v) => (
        <Text key={v.role}>
          {`  ${v.role.padEnd(maxRole)} ${decisionLabel(v.decision)} ${formatBar(v.confidence, 10)}`}
        </Text>
      ))}
      {activeVote.outcome !== null && <Text bold>{`Outcome: ${activeVote.outcome}`}</Text>}
    </Box>
  );
}

function decisionLabel(decision: VoteEntry['decision']): string {
  switch (decision) {
    case 'APPROVE':
      return 'APPROVE';
    case 'REJECT':
      return 'REJECT ';
    case 'PENDING':
      return 'PENDING';
  }
}
