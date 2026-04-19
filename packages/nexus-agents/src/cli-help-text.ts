/**
 * nexus-agents CLI Help Text
 *
 * Help documentation for the CLI commands and options.
 * Extracted from cli-types.ts to maintain file size limits.
 *
 * @module cli-help-text
 */

/**
 * Help text for the CLI.
 */
export const HELP_TEXT = `
nexus-agents - Intelligent orchestration platform for AI coding tools

USAGE:
  nexus-agents [OPTIONS]
  nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:
  (default)       Start MCP server with stdio transport
  hello           Show welcome message and quick start (no API keys needed)
  demo            API-free exploration mode (no API keys needed)
  setup           Configure Claude CLI integration (MCP + CLAUDE.md rules)
  verify          Quick installation verification (no API keys needed)
  doctor          Check CLI installations and health status
  config          Manage configuration (init, get, set, list, reset, export, import)
  expert list     List available experts (built-in and custom)
  workflow list   List available workflow templates
  workflow run    Execute a workflow template
  review <url>    Review a GitHub pull request (dogfooding)
  routing-audit   Debug model routing decisions
  orchestrate     Execute task using CLI tools (standalone mode)
  vote            Run consensus vote on a proposal (6 agents)
  system-review   Run automated system review (5-phase checklist)
  sprint          Automated sprint planning from open issues
  session         Manage session persistence (list, show, export, delete, prune)
  evaluate        Self-evaluation of codebase components
  issue           Issue template validation and management
  index           Generate and manage codebase index
  research        Manage research registry and index
  validation      Show learning validation dashboard
  learning-metrics Show aggregated learning metrics dashboard
  swe-bench       Run SWE-bench evaluation benchmark
  atbench         Run ATBench trajectory-safety evaluation (#1981)
  hooks           Claude CLI hook integration commands
  fitness-audit   Run CLI orchestration fitness score audit
  release-notes   Generate release notes from git commits
  release-validate Run expert swarm validation for releases
  release-announce Generate release announcements (blog, Bluesky)
  scaffold        Generate project files from templates (tool, expert, workflow, command)
  visualize       Generate Mermaid diagrams and ASCII dashboards (architecture, swarm, flow)
  capabilities    Show model capabilities matrix (modalities, tools, features)
  status          At-a-glance project health dashboard (fitness, adapters, version)
  health          Swarm health metrics dashboard (utilization, routing accuracy, failures)
  validate        Run unified validation (doctor + fitness + config)
  auth            Manage MCP authentication tokens (init, show, rotate)

OPTIONS:
  -h, --help           Show this help message
  -v, --version        Show version information
  --verbose            Enable verbose output
  --interactive        Start interactive REPL mode
  -m, --mode <mode>    Server mode: server, orchestrator (default: server)
                       - server:       MCP server only (for Claude CLI integration)
                       - orchestrator: CLI orchestrator (calls Gemini/Codex CLIs)

SETUP OPTIONS:
  --interactive        Run interactive setup wizard with guided prompts
  --non-interactive    Skip prompts (for CI/automation)
  --force              Overwrite existing files
  --skip-mcp           Skip MCP configuration snippet
  --skip-rules         Skip .claude/rules/nexus-agents.md generation
  --skip-hooks         Skip hook configuration in settings.json
  --scope=<scope>      MCP config scope: user, project (default: user)
  --dry-run            Show changes without making them

CONFIG OPTIONS:
  config init            Generate starter configuration file
  config get <key>       Get a configuration value
  config set <key> <val> Set a configuration value
  config list            List all configuration values with categories
  config reset [key]     Reset configuration to defaults (all or specific key)
  config export [file]   Export configuration to file (default: stdout)
  config import <file>   Import configuration from file (JSON or YAML)
  -o, --output <path>    Output path for config init (default: ./nexus-agents.yaml)
  -f, --force            Overwrite existing configuration file

EXPERT OPTIONS:
  --format <fmt>       Output format: table, json, yaml (default: table)

WORKFLOW OPTIONS:
  -i, --input <json>   Workflow inputs as JSON string or file path
  --dry-run            Validate workflow without executing

REVIEW OPTIONS:
  --setup              Run setup wizard
  --dry-run            Review without posting to GitHub
  --skip-checks        Skip pre-flight validation

ROUTING-AUDIT OPTIONS:
  --format=json        Output as JSON (default: ASCII table)
  --verbose            Show explanation of routing steps
  --dry-run            Use deterministic TOPSIS-only selection
  --bandit-stats       Show detailed LinUCB bandit statistics

ORCHESTRATE OPTIONS:
  --model=<name>       Specific CLI to use: claude, gemini, codex (auto-selects)
  --format=<fmt>       Output format: text, json (default: text)
  --dry-run            Show routing decision without executing
  --max-tokens=<n>     Maximum token budget (default: 100000)
  --max-cost-usd=<n>   Maximum cost budget in USD (default: 10)

SYSTEM-REVIEW OPTIONS:
  --create-issue       Create GitHub issue with review results
  --fix                Auto-fix correctable issues (lint errors)
  --verbose            Show detailed phase output

VOTE OPTIONS:
  -p, --proposal <text>  Proposal text to vote on (required)
  -t, --threshold <t>    Voting threshold: majority, supermajority, unanimous
  --timeout=<seconds>    Timeout per vote in seconds (default: 90)
  --quick                Use 3 agents instead of 5 for faster votes
  --dry-run              Simulate votes without actual agent execution
  --verbose              Show vote verification hashes

INDEX OPTIONS:
  index generate         Generate/update codebase index
  index check            Validate index freshness (for CI)
  index diagram          Generate Mermaid dependency diagram
  index validate         Check ARCHITECTURE.md matches index
  index entrypoints      Extract CLI/MCP/REST entrypoints
  index freshness        Check link freshness against last-modified headers
  index links            Extract and validate documentation links
  --format=<yaml|json>   Output format (default: yaml)
  -o, --output=<path>    Custom output path
  --verbose              Show extraction progress

RESEARCH OPTIONS:
  research status [id]   Show technique status (all or specific)
  research overlap <id>  Find overlapping techniques
  research add <arxiv>   Add paper from arXiv
  research stats         Show research statistics
  research refresh       Regenerate RESEARCH_INDEX.md
  research check         Check if index is up to date
  research index         Build/rebuild research search index
  --format=<table|json>  Output format (default: table)
  -o, --output=<path>    Custom output path for refresh

VALIDATION OPTIONS:
  --period=<period>      Time period: 1h, 24h, 7d, 30d, all (default: all)
  --model=<name>         Filter to specific model(s) (comma-separated)
  --task-type=<type>     Filter to specific task type(s) (comma-separated)
  --min-sample=<n>       Minimum sample size for inclusion (default: 10)
  --format=<fmt>         Output format: ascii, json (default: ascii)

LEARNING-METRICS OPTIONS:
  --period=<hours>       Time period in hours (default: 24)
  --format=json          Output format: ascii, json (default: ascii)
  --bandit-stats         Include detailed LinUCB bandit statistics
  --export=<path>        Export metrics to file (JSON format)

SWE-BENCH OPTIONS:
  swe-bench run          Run agents on SWE-bench instances (default)
  swe-bench status       Show progress and completed predictions
  swe-bench info         Display dataset information
  swe-bench evaluate     Evaluate predictions using SWE-bench harness
  --variant=<v>          Dataset variant: lite, verified, full (default: lite)
  --limit=<n>            Maximum instances to run
  --output=<path>        Output predictions file (default: predictions.jsonl)
  --resume               Skip already completed instances
  --instance=<id>        Run specific instance (can be repeated)
  --verbose              Enable verbose output

ATBENCH OPTIONS:
  atbench run            Score trajectories + summarize (default)
  atbench info           Print dataset metadata + scorer mode
  --variant=<claw|codex> Dataset variant (default: claw)
  --limit=<N>            Cap instances (smoke runs)
  --fixture=<path>       Use local JSONL instead of HuggingFace
  --llm-scoring          Enable LLM scorer (default: stub oracle)

HOOKS OPTIONS:
  hooks session-start    Handle SessionStart hook events
  hooks session-end      Handle SessionEnd hook events
  hooks pre-tool         Handle PreToolUse hook events
  hooks post-tool        Handle PostToolUse hook events
  hooks stop             Handle Stop hook events
  --tool <name>          Tool name for pre-tool/post-tool commands
  --validate             Enable input validation (pre-tool)
  --load-context         Load session context (pre-tool)
  --track-metrics        Track execution metrics (post-tool)
  --format               Trigger file formatting (post-tool)
  --check-tasks          Check for incomplete tasks (stop)
  --generate-summary     Generate session summary (stop)
  --export-metrics       Export metrics to file (session-end)

SPRINT OPTIONS:
  sprint plan            Generate sprint proposal from open issues
  sprint list            Show prioritized backlog
  --vote                 Run consensus vote on proposal (via --create-issue)
  --create-issue         Create GitHub issue if approved
  --dry-run              Preview without side effects
  --format=<fmt>         Output format: text, json (default: text)

SESSION OPTIONS:
  session list           List sessions
  session show <id>      Show session details
  session export <id>    Export session to file
  session delete <id>    Delete a session
  session prune <days>   Delete sessions older than N days
  --limit=<n>            Limit results (default: 20)
  --format=<fmt>         Output format: table, json (default: table)
  --output=<path>        Output file path for export
  --dry-run              Preview prune without deleting

EVALUATE OPTIONS:
  evaluate [target]      Evaluate components in target directory
  --target=<path>        Target directory (default: src/adapters/)
  --verbose              Show verbose output
  --format=json          Output as JSON
  --timeout=<ms>         Timeout in milliseconds (default: 120000)

ISSUE OPTIONS:
  issue validate <num>   Validate issue against template
  issue create <type>    Show issue template for creating
  --format=<fmt>         Output format: text, json (default: text)
  Types: feat, bug, task, refactor, docs

FITNESS-AUDIT OPTIONS:
  --format=json          Output as JSON (default: formatted text)
  --min-severity=<sev>   Filter findings: info, warning, critical (default: all)

RELEASE-NOTES OPTIONS:
  --from=<ref>           Start reference (tag or commit, default: latest tag)
  --to=<ref>             End reference (default: HEAD)
  --format=<fmt>         Output format: changelog, json, markdown (default: changelog)
  --dry-run              Preview without saving
  --verbose              Show detailed generation info

RELEASE-VALIDATE OPTIONS:
  --version=<ver>        Version to validate (default: from package.json)
  --strict               Fail on warnings too (default: errors only)
  --skip=<experts>       Skip validators: security,architecture,docs,devops
  --verbose              Show detailed findings

RELEASE-ANNOUNCE OPTIONS:
  --version=<ver>        Version to announce (default: from package.json)
  --channels=<list>      Channels: blog,bluesky (default: blog,bluesky)
  --release-url=<url>    GitHub release URL
  --dry-run              Preview announcements without posting
  --verbose              Show detailed output

SCAFFOLD OPTIONS:
  scaffold <type> <name> Generate project files from templates
  --dry-run              Show what would be created without writing files
  Types: tool, expert, workflow, command

VISUALIZE OPTIONS:
  visualize architecture    Show Mermaid diagram of nexus-agents architecture
  visualize swarm           Show Mermaid diagram of agent swarm topology
  visualize orchestration   Show orchestration execution (ASCII dashboard or Mermaid)
  visualize flow            Show task execution pipeline as Mermaid flow diagram
  --format=<fmt>            Output: mermaid (default), ascii, markdown
  --output=<path>           Write diagram to file instead of stdout

CAPABILITIES OPTIONS:
  capabilities list                    Show all models and their capabilities
  capabilities compare <m1> <m2>       Side-by-side model comparison
  capabilities find <capability>       Find models supporting a capability
  --format=<fmt>                       Output: table (default), json, markdown

AUTH OPTIONS:
  auth init              Generate a new authentication token
  auth show              Show token status (file location, permissions)
  auth rotate            Generate new token, invalidate old one
  --force                Overwrite existing token (for init)
  --format=<fmt>         Output format: text, json (default: text)

DEMO OPTIONS:
  demo routing "task"    Show how routing would select models (mock)
  demo expert-list       Show available experts with descriptions
  demo workflow [name]   Show workflow steps (dry-run preview)

EXAMPLES:
  nexus-agents demo                              API-free exploration mode help
  nexus-agents demo routing "Implement sorting"  Demo routing decision (mock)
  nexus-agents demo expert-list                  List available experts
  nexus-agents demo workflow                     List available workflows
  nexus-agents demo workflow code-review         Demo code-review workflow steps
  nexus-agents hello            Show welcome message and quick start
  nexus-agents setup            Configure Claude CLI integration
  nexus-agents setup --interactive  Run guided setup wizard
  nexus-agents setup --dry-run  Preview changes without applying
  nexus-agents setup --force    Overwrite existing configurations
  nexus-agents verify           Quick installation check (first thing to run!)
  nexus-agents                  Start MCP server (default)
  nexus-agents --interactive    Start interactive REPL
  nexus-agents doctor           Check CLI health
  nexus-agents config init      Generate config file
  nexus-agents config get TIMEOUT_DEFAULTS.cliMs    Get timeout value
  nexus-agents config set TIMEOUT_DEFAULTS.cliMs 90000  Set timeout
  nexus-agents config list      List all configuration values
  nexus-agents config reset     Reset all to defaults
  nexus-agents config export ./config.json  Export configuration
  nexus-agents config import ./config.yaml  Import configuration
  nexus-agents expert list      List available experts
  nexus-agents workflow list    List workflow templates
  nexus-agents workflow run code-review --dry-run
  nexus-agents review https://github.com/owner/repo/pull/123
  nexus-agents review owner/repo#123 --dry-run
  nexus-agents routing-audit "Implement sorting algorithm"
  nexus-agents routing-audit "Review code" --bandit-stats
  nexus-agents orchestrate "Explain this function" --model=claude
  nexus-agents orchestrate "Generate unit tests" --dry-run
  nexus-agents orchestrate "Refactor for performance" --format=json
  nexus-agents system-review                      Run 5-phase system review
  nexus-agents system-review --create-issue       Create GitHub issue with results
  nexus-agents system-review --fix                Auto-fix correctable issues
  nexus-agents vote --proposal "Add feature X"    Run consensus vote
  nexus-agents vote -p "Proposal" -t unanimous    Vote with unanimous threshold
  nexus-agents vote -p "Quick decision" --quick   Fast 3-agent vote
  nexus-agents vote -p "Complex proposal" --timeout=120  Use longer timeout
  nexus-agents index generate                     Generate codebase index
  nexus-agents index check                        Check if index is up to date
  nexus-agents index diagram                      Generate dependency diagram
  nexus-agents index entrypoints                  Extract entrypoints to YAML
  nexus-agents index freshness                    Check link freshness
  nexus-agents index links                        Extract and validate links
  nexus-agents research status                    Show all technique statuses
  nexus-agents research stats                     Show research statistics
  nexus-agents research stats --format=json       Statistics as JSON
  nexus-agents research refresh                   Regenerate RESEARCH_INDEX.md
  nexus-agents research check                     Check if index is up to date
  nexus-agents research index                     Build research search index
  nexus-agents validation                         Show learning validation dashboard
  nexus-agents validation --period=7d             Show dashboard for last 7 days
  nexus-agents validation --format=json           Output dashboard as JSON
  nexus-agents validation --model=claude          Filter to Claude only
  nexus-agents learning-metrics                   Show learning metrics dashboard
  nexus-agents learning-metrics --period=48       Show metrics for last 48 hours
  nexus-agents learning-metrics --bandit-stats    Include detailed bandit stats
  nexus-agents learning-metrics --format=json     Output as JSON
  nexus-agents swe-bench info                     Show SWE-bench dataset info
  nexus-agents swe-bench run --limit=5            Run 5 SWE-bench instances
  nexus-agents swe-bench status                   Check progress
  nexus-agents swe-bench evaluate                 Evaluate predictions
  nexus-agents atbench info                       Show ATBench info
  nexus-agents atbench run --variant=claw --limit=10  Smoke-test ATBench
  nexus-agents hooks --help                       Show hooks command help
  nexus-agents hooks session-start                Handle session start hook
  nexus-agents hooks pre-tool --tool Bash         Handle pre-tool hook for Bash
  nexus-agents sprint list                        Show prioritized backlog
  nexus-agents sprint plan                        Generate sprint proposal
  nexus-agents sprint plan --create-issue         Create issue if vote passes
  nexus-agents session list                       List stored sessions
  nexus-agents session show abc123                Show session details
  nexus-agents session export abc123 --output=session.md  Export to markdown
  nexus-agents session prune 30                   Delete sessions older than 30 days
  nexus-agents evaluate                           Evaluate default target (src/adapters/)
  nexus-agents evaluate src/core/ --verbose       Evaluate core with verbose output
  nexus-agents issue validate 123                 Validate issue #123 against template
  nexus-agents issue create feat                  Show feature issue template
  nexus-agents fitness-audit                      Run CLI fitness score audit (target: 90+)
  nexus-agents fitness-audit --format=json        Output fitness audit as JSON
  nexus-agents release-notes                      Generate release notes from recent commits
  nexus-agents release-notes --format=markdown    Output as GitHub release markdown
  nexus-agents release-notes --verbose            Show detailed generation info
  nexus-agents release-validate                   Run expert swarm validation
  nexus-agents release-validate --verbose         Show detailed findings
  nexus-agents release-announce --dry-run         Preview announcements without posting
  nexus-agents release-announce --channels=blog   Generate blog post only
  nexus-agents scaffold tool code-analysis        Scaffold a new MCP tool
  nexus-agents scaffold expert performance        Scaffold an expert module
  nexus-agents scaffold workflow deploy-check     Scaffold a workflow template
  nexus-agents scaffold command migrate --dry-run Preview scaffold without writing
  nexus-agents visualize architecture              Show system architecture diagram
  nexus-agents visualize swarm --format=markdown   Agent swarm topology (markdown)
  nexus-agents visualize orchestration --format=ascii  ASCII execution dashboard
  nexus-agents visualize flow --output=flow.md     Save pipeline flow to file
  nexus-agents capabilities list                    Show model capabilities matrix
  nexus-agents capabilities compare claude-opus gemini-pro  Compare two models
  nexus-agents capabilities find image_png           Find models that generate images
  nexus-agents capabilities list --format=json       Output capabilities as JSON
  nexus-agents status                                 Show project health dashboard
  nexus-agents status --format=json                   Output status as JSON
  nexus-agents health                                 Show swarm health metrics
  nexus-agents health --format=json                   Output health metrics as JSON
  nexus-agents auth init                              Generate initial auth token
  nexus-agents auth show                              Check token status
  nexus-agents auth rotate                            Rotate to new token
  nexus-agents auth init --force                      Regenerate token (overwrite existing)

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();
