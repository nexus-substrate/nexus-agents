/**
 * nexus-agents/testing/tasks/definitions - Task 005
 *
 * Task 005: Architecture Decision
 * Optimal for Claude - requires deep reasoning and trade-off analysis.
 */

import type { EvaluationTask } from '../task-types.js';

/**
 * Task 5: Architecture Decision
 * Optimal for Claude - requires deep reasoning and trade-off analysis.
 */
export const TASK_005_ARCHITECTURE_DECISION: EvaluationTask = {
  id: 'task-005',
  name: 'Architecture Decision',
  category: 'architecture',
  difficulty: 'expert',
  description: 'Make and justify complex architectural decisions.',
  prompt: `We're designing a multi-agent AI system where multiple LLM-powered agents collaborate on complex tasks. We need to choose between three communication patterns:

Option A: Central Orchestrator
- Single orchestrator agent coordinates all specialists
- All messages route through orchestrator
- Orchestrator maintains global state

Option B: Peer-to-Peer Mesh
- Agents communicate directly with each other
- Shared message bus for broadcasting
- Distributed state with eventual consistency

Option C: Hierarchical Teams
- Agents organized in teams with team leads
- Team leads coordinate within teams
- Cross-team communication through leads only

Context:
- 5-10 specialist agents (code, security, test, docs, etc.)
- Tasks range from simple (single agent) to complex (all agents)
- Some agents are stateful (maintain context)
- Need to handle agent failures gracefully
- Must support both sync and async operations
- Target latency: <5 seconds for simple, <30 seconds for complex

Provide:
1. Detailed analysis of each option
2. Your recommendation with justification
3. Implementation considerations
4. Failure handling strategy
5. Performance optimization approaches`,
  expectedOutcome: {
    mustContain: ['orchestrator', 'trade-off', 'recommend', 'failure', 'latency'],
    mustNotContain: [],
    minLength: 1200,
  },
  scoringRubric: {
    criteria: [
      {
        id: 'analysis_depth',
        description: 'Thorough analysis of all three options',
        weight: 0.3,
        maxScore: 10,
        indicators: ['pros', 'cons', 'trade-off', 'compare'],
      },
      {
        id: 'recommendation_quality',
        description: 'Well-reasoned recommendation',
        weight: 0.25,
        maxScore: 10,
        indicators: ['recommend', 'because', 'given the'],
      },
      {
        id: 'practical_considerations',
        description: 'Addresses real-world implementation issues',
        weight: 0.25,
        maxScore: 10,
        indicators: ['implement', 'consider', 'handle', 'scale'],
      },
      {
        id: 'failure_handling',
        description: 'Robust failure handling strategy',
        weight: 0.2,
        maxScore: 10,
        indicators: ['failure', 'retry', 'timeout', 'fallback'],
      },
    ],
    maxTotalScore: 10,
    passingScore: 7,
    notes: 'Expert-level task requiring system design experience',
  },
  timeoutMs: 180000,
  optimalCli: 'claude',
  acceptableClis: ['claude'],
  tags: ['architecture', 'system-design', 'multi-agent', 'expert'],
};
