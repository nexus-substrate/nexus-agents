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
nexus-agents - Multi-agent orchestration MCP server

USAGE:
  nexus-agents [OPTIONS]
  nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:
  (default)       Start MCP server with stdio transport
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
  system-review   Run automated system review (5-phase checklist)
  index           Generate and manage codebase index
  research        Manage research registry and index
  validation      Show learning validation dashboard
  learning-metrics Show aggregated learning metrics dashboard
  swe-bench       Run SWE-bench evaluation benchmark

OPTIONS:
  -h, --help           Show this help message
  -v, --version        Show version information
  --verbose            Enable verbose output
  --interactive        Start interactive REPL mode
  -m, --mode <mode>    Server mode: server, orchestrator, mesh (default: server)
                       - server:       MCP server only (for Claude CLI integration)
                       - orchestrator: CLI orchestrator (calls Gemini/Codex CLIs)
                       - mesh:         Full bidirectional (both modes)

SETUP OPTIONS:
  --non-interactive    Skip prompts (for CI/automation)
  --force              Overwrite existing files
  --skip-mcp           Skip MCP configuration snippet
  --skip-rules         Skip .claude/rules/nexus-agents.md generation
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

EXAMPLES:
  nexus-agents setup            Configure Claude CLI integration
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
  nexus-agents --mode=mesh      Full hybrid mesh mode
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

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();
