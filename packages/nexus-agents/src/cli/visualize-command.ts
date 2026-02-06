/**
 * nexus-agents/cli - Visualize Command
 *
 * CLI command for generating visual diagrams and dashboards.
 * Produces Mermaid diagrams for architecture, agent swarms,
 * orchestration flows, and ASCII art telemetry dashboards.
 *
 * @module cli/visualize-command
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { EXIT_CODES } from '../cli-types.js';
import {
  generateArchitectureDiagram,
  generateSwarmVisualization,
  generateFlowDiagram,
  generateOrchestrationSequence,
  generateAsciiDashboard,
  generateSystemSummary,
  wrapInMarkdownFence,
  type ArchitectureComponent,
  type SwarmAgent,
  type OrchestrationVizData,
} from '../utils/visual-output.js';
import { gatherSystemSummary } from './visualize-summary.js';

// ============================================================================
// Subcommand types
// ============================================================================

type VisualizeSubcommand = 'architecture' | 'swarm' | 'orchestration' | 'flow' | 'summary';

const VALID_SUBCOMMANDS: readonly VisualizeSubcommand[] = [
  'architecture',
  'swarm',
  'orchestration',
  'flow',
  'summary',
];

// ============================================================================
// Usage text
// ============================================================================

const USAGE = `
nexus-agents visualize <subcommand> [options]

SUBCOMMANDS:
  architecture   Generate a Mermaid architecture diagram of nexus-agents
  swarm          Generate a Mermaid diagram of the agent swarm topology
  orchestration  Generate an ASCII dashboard or Mermaid sequence diagram
  flow           Generate a Mermaid flow diagram of the execution pipeline
  summary        Generate a live system overview dashboard from codebase stats

OPTIONS:
  --format=<fmt>   Output format: mermaid, ascii, markdown (default: mermaid)
  --output=<path>  Write output to file instead of stdout

EXAMPLES:
  nexus-agents visualize architecture
  nexus-agents visualize swarm --format=markdown
  nexus-agents visualize orchestration --format=ascii
  nexus-agents visualize flow
`.trim();

// ============================================================================
// Data generators (static analysis of the nexus-agents architecture)
// ============================================================================

/** Static architecture component data for the nexus-agents system. */
const NEXUS_ARCHITECTURE: ArchitectureComponent[] = [
  { name: 'CLI Parser', layer: 'CLI', connections: ['Command Dispatch'] },
  {
    name: 'Command Dispatch',
    layer: 'CLI',
    connections: ['Orchestrator', 'Expert Factory', 'Workflow Engine', 'Consensus Engine'],
  },
  { name: 'MCP Server', layer: 'CLI', connections: ['Tool Registry'] },
  {
    name: 'Tool Registry',
    layer: 'MCP Tools',
    connections: [
      'Orchestrate Tool',
      'Expert Tools',
      'Workflow Tool',
      'Vote Tool',
      'Delegate Tool',
    ],
  },
  { name: 'Orchestrate Tool', layer: 'MCP Tools', connections: ['Orchestrator'] },
  { name: 'Expert Tools', layer: 'MCP Tools', connections: ['Expert Factory'] },
  { name: 'Workflow Tool', layer: 'MCP Tools', connections: ['Workflow Engine'] },
  { name: 'Vote Tool', layer: 'MCP Tools', connections: ['Consensus Engine'] },
  { name: 'Delegate Tool', layer: 'MCP Tools', connections: ['Composite Router'] },
  {
    name: 'Orchestrator',
    layer: 'Agents',
    connections: ['Task Analyzer', 'Expert Factory', 'Model Adapter'],
  },
  {
    name: 'Expert Factory',
    layer: 'Agents',
    connections: ['Code Expert', 'Security Expert', 'Arch Expert'],
  },
  { name: 'Code Expert', layer: 'Agents', connections: ['Model Adapter'] },
  { name: 'Security Expert', layer: 'Agents', connections: ['Model Adapter'] },
  { name: 'Arch Expert', layer: 'Agents', connections: ['Model Adapter'] },
  { name: 'Task Analyzer', layer: 'Core', connections: [] },
  {
    name: 'Composite Router',
    layer: 'Core',
    connections: ['Budget Router', 'TOPSIS Router', 'LinUCB'],
  },
  { name: 'Budget Router', layer: 'Core', connections: [] },
  { name: 'TOPSIS Router', layer: 'Core', connections: [] },
  { name: 'LinUCB', layer: 'Core', connections: [] },
  { name: 'Consensus Engine', layer: 'Core', connections: [] },
  { name: 'Workflow Engine', layer: 'Core', connections: ['Model Adapter'] },
  {
    name: 'Model Adapter',
    layer: 'Adapters',
    connections: ['Claude CLI', 'Gemini CLI', 'Codex CLI'],
  },
  { name: 'Claude CLI', layer: 'Adapters', connections: [] },
  { name: 'Gemini CLI', layer: 'Adapters', connections: [] },
  { name: 'Codex CLI', layer: 'Adapters', connections: [] },
];

/**
 * Generates swarm agent data for the standard nexus-agents swarm topology.
 */
function getNexusSwarmAgents(): SwarmAgent[] {
  return [
    {
      id: 'orchestrator',
      role: 'orchestrator',
      status: 'active',
      connections: [
        'code-expert',
        'security-expert',
        'arch-expert',
        'testing-expert',
        'docs-expert',
      ],
    },
    { id: 'code-expert', role: 'code_expert', status: 'idle', connections: ['orchestrator'] },
    {
      id: 'security-expert',
      role: 'security_expert',
      status: 'idle',
      connections: ['orchestrator'],
    },
    {
      id: 'arch-expert',
      role: 'architecture_expert',
      status: 'idle',
      connections: ['orchestrator'],
    },
    { id: 'testing-expert', role: 'testing_expert', status: 'idle', connections: ['orchestrator'] },
    {
      id: 'docs-expert',
      role: 'documentation_expert',
      status: 'idle',
      connections: ['orchestrator'],
    },
    { id: 'devops-expert', role: 'devops_expert', status: 'idle', connections: ['orchestrator'] },
  ];
}

/** Sample orchestration execution for visualization. */
const SAMPLE_ORCHESTRATION: OrchestrationVizData = {
  executionId: 'orch-demo-001',
  orchestratorType: 'orchestrator',
  steps: [
    {
      id: 'analyze',
      role: 'orchestrator',
      action: 'Analyze task',
      status: 'success',
      durationMs: 2500,
      tokensUsed: 450,
    },
    {
      id: 'decompose',
      role: 'orchestrator',
      action: 'Decompose into subtasks',
      status: 'success',
      durationMs: 1800,
      tokensUsed: 320,
    },
    {
      id: 'code-impl',
      role: 'code_expert',
      action: 'Implement solution',
      status: 'success',
      durationMs: 8500,
      tokensUsed: 1200,
    },
    {
      id: 'security-review',
      role: 'security_expert',
      action: 'Security audit',
      status: 'success',
      durationMs: 4200,
      tokensUsed: 680,
    },
    {
      id: 'test-gen',
      role: 'testing_expert',
      action: 'Generate tests',
      status: 'success',
      durationMs: 5100,
      tokensUsed: 890,
    },
    {
      id: 'synthesize',
      role: 'orchestrator',
      action: 'Synthesize results',
      status: 'success',
      durationMs: 1500,
      tokensUsed: 280,
    },
  ],
  totalDurationMs: 23600,
  totalTokensUsed: 3820,
  agentsUsed: ['orchestrator', 'code_expert', 'security_expert', 'testing_expert'],
};

/**
 * Gets execution pipeline flow steps.
 */
function getExecutionFlow(): { id: string; name: string; next?: string[] }[] {
  return [
    { id: 'receive', name: 'Receive Task', next: ['analyze'] },
    { id: 'analyze', name: 'Analyze Complexity', next: ['route'] },
    { id: 'route', name: 'Route via CompositeRouter', next: ['budget', 'topsis'] },
    { id: 'budget', name: 'Budget Check', next: ['select'] },
    { id: 'topsis', name: 'TOPSIS Score', next: ['select'] },
    { id: 'select', name: 'Select Model', next: ['execute'] },
    { id: 'execute', name: 'Execute via Adapter', next: ['validate'] },
    { id: 'validate', name: 'Validate Response', next: ['feedback', 'retry'] },
    { id: 'feedback', name: 'Record Feedback', next: ['done'] },
    { id: 'retry', name: 'Retry with Fallback', next: ['execute'] },
    { id: 'done', name: 'Return Result' },
  ];
}

// ============================================================================
// Output formatting
// ============================================================================

type OutputFormat = 'mermaid' | 'ascii' | 'markdown';

function formatOutput(diagram: string, format: OutputFormat, title: string): string {
  if (format === 'markdown') {
    return wrapInMarkdownFence(diagram, title);
  }
  return diagram;
}

// ============================================================================
// Command handler
// ============================================================================

/** Generate diagram output for a given subcommand and format. */
function generateDiagramOutput(subcommand: VisualizeSubcommand, format: OutputFormat): string {
  switch (subcommand) {
    case 'architecture':
      return formatOutput(
        generateArchitectureDiagram(NEXUS_ARCHITECTURE),
        format,
        'Nexus Agents Architecture'
      );
    case 'swarm':
      return formatOutput(
        generateSwarmVisualization(getNexusSwarmAgents()),
        format,
        'Agent Swarm Topology'
      );
    case 'orchestration':
      if (format === 'ascii') return generateAsciiDashboard(SAMPLE_ORCHESTRATION);
      return formatOutput(
        generateOrchestrationSequence(SAMPLE_ORCHESTRATION),
        format,
        'Orchestration Execution'
      );
    case 'flow':
      return formatOutput(
        generateFlowDiagram(getExecutionFlow()),
        format,
        'Task Execution Pipeline'
      );
    case 'summary':
      return generateSystemSummary(gatherSystemSummary());
  }
}

/** Write output to file or stdout. */
function writeOutput(output: string, outputPath: string | undefined): void {
  if (outputPath !== undefined) {
    import('node:fs')
      .then((fs) => {
        fs.writeFileSync(outputPath, output + '\n', 'utf-8');
        process.stdout.write(`Diagram written to ${outputPath}\n`);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write(`Failed to write file: ${msg}\n`);
        process.exit(EXIT_CODES.SERVER_START_FAILED);
      });
  } else {
    process.stdout.write(output + '\n');
  }
}

/**
 * Handles the `nexus-agents visualize` command.
 */
export function handleVisualizeCommand(args: ParsedCliArgs): void {
  const subcommand = args.positionals[1];

  if (subcommand === undefined || !VALID_SUBCOMMANDS.includes(subcommand as VisualizeSubcommand)) {
    process.stdout.write(USAGE + '\n');
    process.exit(subcommand === undefined ? EXIT_CODES.SUCCESS : EXIT_CODES.INVALID_ARGS);
  }

  const format = (args.options.format as OutputFormat | undefined) ?? 'mermaid';
  const output = generateDiagramOutput(subcommand as VisualizeSubcommand, format);
  writeOutput(output, args.options.output);
}
