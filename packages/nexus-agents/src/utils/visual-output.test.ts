import { describe, it, expect } from 'vitest';
import {
  generateDependencyGraph,
  generateArchitectureDiagram,
  generateSwarmVisualization,
  generateFlowDiagram,
  generateOrchestrationSequence,
  generateAsciiDashboard,
  generateVoteSummary,
  wrapInMarkdownFence,
  type OrchestrationVizData,
} from './visual-output.js';

describe('visual-output', () => {
  describe('generateDependencyGraph', () => {
    it('should generate a valid Mermaid dependency graph', () => {
      const result = generateDependencyGraph([
        { name: 'api', deps: ['core', 'auth'] },
        { name: 'core', deps: ['utils'] },
        { name: 'utils', deps: [] },
      ]);

      expect(result).toContain('graph TD');
      expect(result).toContain('api');
      expect(result).toContain('core');
      expect(result).toContain('utils');
      expect(result).toContain('api[api] --> core[core]');
      expect(result).toContain('api[api] --> auth[auth]');
      expect(result).toContain('core[core] --> utils[utils]');
    });

    it('should render standalone nodes for modules with no dependencies', () => {
      const result = generateDependencyGraph([{ name: 'standalone', deps: [] }]);

      expect(result).toContain('graph TD');
      expect(result).toContain('standalone[standalone]');
      expect(result).not.toContain('-->');
    });

    it('should handle empty input', () => {
      const result = generateDependencyGraph([]);
      expect(result).toBe('graph TD');
    });

    it('should sanitize unsafe characters in labels', () => {
      const result = generateDependencyGraph([{ name: 'mod<script>', deps: ['dep"evil"'] }]);

      // Labels should be sanitized (no angle brackets or quotes in node text)
      expect(result).toContain('modscript');
      expect(result).toContain('depevil');
      // Original unsafe chars should not appear in labels
      expect(result).not.toContain('[mod<script>]');
      expect(result).not.toContain('[dep"evil"]');
    });
  });

  describe('generateArchitectureDiagram', () => {
    it('should group components into layer subgraphs', () => {
      const result = generateArchitectureDiagram([
        { name: 'REST API', layer: 'API', connections: ['Service'] },
        { name: 'MCP Server', layer: 'API', connections: ['Service'] },
        { name: 'Service', layer: 'Core', connections: [] },
      ]);

      expect(result).toContain('graph TB');
      expect(result).toContain('subgraph API[API]');
      expect(result).toContain('subgraph Core[Core]');
      expect(result).toContain('REST_API[REST API]');
      expect(result).toContain('MCP_Server[MCP Server]');
      expect(result).toContain('REST_API --> Service');
      expect(result).toContain('MCP_Server --> Service');
    });

    it('should handle components with no connections', () => {
      const result = generateArchitectureDiagram([
        { name: 'Database', layer: 'Data', connections: [] },
      ]);

      expect(result).toContain('subgraph Data[Data]');
      expect(result).toContain('Database[Database]');
      expect(result).not.toContain('-->');
    });

    it('should handle empty input', () => {
      const result = generateArchitectureDiagram([]);
      expect(result).toBe('graph TB');
    });
  });

  describe('generateSwarmVisualization', () => {
    it('should render agents with role labels and connections', () => {
      const result = generateSwarmVisualization([
        { id: 'lead', role: 'TechLead', status: 'active', connections: ['dev1'] },
        { id: 'dev1', role: 'code_expert', status: 'idle', connections: [] },
      ]);

      expect(result).toContain('graph LR');
      expect(result).toContain('lead[lead: TechLead]');
      expect(result).toContain('dev1[dev1: code_expert]');
      expect(result).toContain('lead <--> dev1');
    });

    it('should apply status-based styling classes', () => {
      const result = generateSwarmVisualization([
        { id: 'a1', role: 'role1', status: 'active', connections: [] },
        { id: 'a2', role: 'role2', status: 'completed', connections: [] },
        { id: 'a3', role: 'role3', status: 'error', connections: [] },
        { id: 'a4', role: 'role4', status: 'idle', connections: [] },
      ]);

      expect(result).toContain('classDef active fill:#4CAF50');
      expect(result).toContain('classDef idle fill:#9E9E9E');
      expect(result).toContain('classDef completed fill:#2196F3');
      expect(result).toContain('classDef error fill:#F44336');
      expect(result).toContain('class a1 active');
      expect(result).toContain('class a2 completed');
      expect(result).toContain('class a3 error');
      expect(result).toContain('class a4 idle');
    });

    it('should map alternative status names', () => {
      const result = generateSwarmVisualization([
        { id: 'a1', role: 'r1', status: 'running', connections: [] },
        { id: 'a2', role: 'r2', status: 'done', connections: [] },
        { id: 'a3', role: 'r3', status: 'failed', connections: [] },
      ]);

      expect(result).toContain('class a1 active');
      expect(result).toContain('class a2 completed');
      expect(result).toContain('class a3 error');
    });

    it('should handle empty input', () => {
      const result = generateSwarmVisualization([]);
      // Should still have class definitions
      expect(result).toContain('graph LR');
      expect(result).toContain('classDef active');
    });
  });

  describe('generateFlowDiagram', () => {
    it('should render steps with directed edges', () => {
      const result = generateFlowDiagram([
        { id: 'start', name: 'Begin', next: ['process'] },
        { id: 'process', name: 'Process', next: ['end'] },
        { id: 'end', name: 'Done' },
      ]);

      expect(result).toContain('graph TD');
      expect(result).toContain('start[Begin]');
      expect(result).toContain('start --> process');
      expect(result).toContain('process[Process]');
      expect(result).toContain('process --> end');
    });

    it('should render terminal steps as rounded nodes', () => {
      const result = generateFlowDiagram([
        { id: 'start', name: 'Begin', next: ['end'] },
        { id: 'end', name: 'Done' },
      ]);

      // Terminal nodes use rounded syntax ([...])
      expect(result).toContain('end([Done])');
    });

    it('should support branching (multiple next steps)', () => {
      const result = generateFlowDiagram([
        { id: 'decide', name: 'Decision', next: ['yes', 'no'] },
        { id: 'yes', name: 'Approved' },
        { id: 'no', name: 'Rejected' },
      ]);

      expect(result).toContain('decide --> yes');
      expect(result).toContain('decide --> no');
    });

    it('should treat empty next array as terminal', () => {
      const result = generateFlowDiagram([{ id: 'only', name: 'Only Step', next: [] }]);

      expect(result).toContain('only([Only Step])');
      expect(result).not.toContain('-->');
    });

    it('should handle empty input', () => {
      const result = generateFlowDiagram([]);
      expect(result).toBe('graph TD');
    });
  });

  describe('wrapInMarkdownFence', () => {
    it('should wrap diagram in mermaid code fence', () => {
      const diagram = 'graph TD\n  A --> B';
      const result = wrapInMarkdownFence(diagram);

      expect(result).toBe('```mermaid\ngraph TD\n  A --> B\n```');
    });

    it('should include title as heading when provided', () => {
      const diagram = 'graph TD\n  A --> B';
      const result = wrapInMarkdownFence(diagram, 'My Diagram');

      expect(result).toContain('## My Diagram');
      expect(result).toContain('```mermaid');
      expect(result).toContain('graph TD\n  A --> B');
      expect(result).toContain('```');
    });

    it('should sanitize title text', () => {
      const result = wrapInMarkdownFence('graph TD', 'Title <script>');
      expect(result).toContain('## Title script');
      expect(result).not.toContain('<');
    });
  });

  describe('generateOrchestrationSequence', () => {
    const sampleData: OrchestrationVizData = {
      executionId: 'test-exec-001',
      orchestratorType: 'tech_lead',
      steps: [
        {
          id: 'analyze',
          role: 'TechLead',
          action: 'Analyze task',
          status: 'success',
          durationMs: 2500,
          tokensUsed: 450,
        },
        {
          id: 'impl',
          role: 'code_expert',
          action: 'Implement',
          status: 'success',
          durationMs: 8000,
          tokensUsed: 1200,
        },
        {
          id: 'review',
          role: 'security_expert',
          action: 'Security review',
          status: 'error',
          durationMs: 3000,
          tokensUsed: 500,
        },
      ],
      totalDurationMs: 13500,
      totalTokensUsed: 2150,
      agentsUsed: ['TechLead', 'code_expert', 'security_expert'],
    };

    it('should generate a valid Mermaid sequence diagram', () => {
      const result = generateOrchestrationSequence(sampleData);

      expect(result).toContain('sequenceDiagram');
      expect(result).toContain('participant O as Orchestrator');
      expect(result).toContain('participant TechLead as TechLead');
      expect(result).toContain('participant code_expert as code_expert');
    });

    it('should show step interactions with timing', () => {
      const result = generateOrchestrationSequence(sampleData);

      expect(result).toContain('O->>TechLead: Analyze task');
      expect(result).toContain('TechLead->>O: + Done (2500ms)');
      expect(result).toContain('O->>code_expert: Implement');
    });

    it('should mark error steps with error response', () => {
      const result = generateOrchestrationSequence(sampleData);

      expect(result).toContain('security_expert-->>O: Error (3000ms)');
    });

    it('should include total summary note', () => {
      const result = generateOrchestrationSequence(sampleData);

      expect(result).toContain('Note over O: Total: 13500ms, 2150 tokens');
    });

    it('should handle empty steps', () => {
      const emptyData: OrchestrationVizData = {
        executionId: 'empty',
        orchestratorType: 'test',
        steps: [],
        totalDurationMs: 0,
        totalTokensUsed: 0,
        agentsUsed: [],
      };
      const result = generateOrchestrationSequence(emptyData);

      expect(result).toContain('sequenceDiagram');
      expect(result).toContain('Note over O: Total: 0ms, 0 tokens');
    });
  });

  describe('generateAsciiDashboard', () => {
    const sampleData: OrchestrationVizData = {
      executionId: 'dash-001',
      orchestratorType: 'tech_lead',
      steps: [
        {
          id: 'a',
          role: 'TechLead',
          action: 'Analyze',
          status: 'success',
          durationMs: 2000,
          tokensUsed: 300,
        },
        {
          id: 'b',
          role: 'code_expert',
          action: 'Implement',
          status: 'success',
          durationMs: 8000,
          tokensUsed: 1200,
        },
        {
          id: 'c',
          role: 'security',
          action: 'Review',
          status: 'error',
          durationMs: 500,
          tokensUsed: 100,
        },
      ],
      totalDurationMs: 10500,
      totalTokensUsed: 1600,
      agentsUsed: ['TechLead', 'code_expert', 'security'],
    };

    it('should contain dashboard header', () => {
      const result = generateAsciiDashboard(sampleData);

      expect(result).toContain('ORCHESTRATION DASHBOARD');
    });

    it('should show execution metadata', () => {
      const result = generateAsciiDashboard(sampleData);

      expect(result).toContain('dash-001');
      expect(result).toContain('tech_lead');
      expect(result).toContain('10500ms');
    });

    it('should show status icons for each step', () => {
      const result = generateAsciiDashboard(sampleData);

      expect(result).toContain('✓');
      expect(result).toContain('✗');
    });

    it('should render timing bars', () => {
      const result = generateAsciiDashboard(sampleData);

      expect(result).toContain('█');
      expect(result).toContain('░');
    });
  });

  describe('generateVoteSummary', () => {
    it('should render approved vote summary', () => {
      const votes = [
        { role: 'Architect', decision: 'approve', confidence: 0.9 },
        { role: 'Security', decision: 'approve', confidence: 0.85 },
        { role: 'PM', decision: 'reject', confidence: 0.6 },
      ];

      const result = generateVoteSummary(votes, 'approved', 67);

      expect(result).toContain('CONSENSUS VOTE RESULTS');
      expect(result).toContain('APPROVED');
      expect(result).toContain('67%');
      expect(result).toContain('Architect');
      expect(result).toContain('90%');
    });

    it('should render rejected vote summary', () => {
      const votes = [{ role: 'Architect', decision: 'reject', confidence: 0.8 }];

      const result = generateVoteSummary(votes, 'rejected', 0);

      expect(result).toContain('REJECTED');
    });
  });
});
