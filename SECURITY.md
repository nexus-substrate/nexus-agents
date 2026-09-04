# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### Security Contact

- **Email**: [williamzujkowski@gmail.com](mailto:williamzujkowski@gmail.com)
- **GitHub Security Advisory** (preferred): https://github.com/nexus-substrate/nexus-agents/security/advisories/new

### Do NOT

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before it has been addressed
- Exploit the vulnerability for any purpose

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if any)
- CWE identifier (if known)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Dependent on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: Next release

## Security Practices

### Code Security

This project implements these security measures:

- **Input Validation**: All inputs validated with Zod schemas at boundaries
- **Path Safety**: Path traversal prevention on all file operations
- **No User RegExp**: Static regex patterns only, no user-provided regular expressions
- **Secrets Handling**: Environment variables for API keys, sanitized before logging
- **Rate Limiting**: Token bucket rate limiting on all public tools
- **Memory Bounds**: Bounded collections and context pruning

### Dependency Security

- `pnpm audit --audit-level=high` runs on every CI build, **advisory** (`continue-on-error`): a third-party advisory publication must not redden every open PR, and suppressions need a warrant in `.github/audit-exceptions.json`. It audits the **workspace** lockfile, whose `pnpm.overrides` are repo-local and never reach a consumer — so it describes this checkout, not what `npm install nexus-agents` resolves. The published dependency graph is described by the release SBOM, generated from the packed tarball ([#5429](https://github.com/nexus-substrate/nexus-agents/issues/5429)).
- Dependabot enabled for automated security updates
- No deprecated packages allowed
- Regular dependency review and updates

### Authentication & Authorization

- API keys are never logged or exposed in error messages
- Secrets are sanitized before any output
- Environment variables validated at startup

## Security Checklist

Before each release:

- [ ] `pnpm audit --audit-level=high` is clean for the workspace, **and** the release SBOM (packed-tarball graph, `release.yml`) carries no component with an open high/critical advisory — the two audit different trees, and only the second is what users install
- [ ] All dependencies are current and not deprecated
- [ ] No secrets in code, logs, or test fixtures
- [ ] Path traversal tests pass
- [ ] Rate limiting is enabled on all public interfaces
- [ ] Input validation covers all tool boundaries
- [ ] Memory bounds are enforced on collections

## Known Security Considerations

### MCP Tool Execution

MCP tools execute with the permissions of the host process. Users should:

- Run with minimal required permissions
- Use separate API keys for different environments
- Monitor token usage and rate limits

### Model API Keys

API keys for model providers (Anthropic, OpenAI, etc.) are sensitive:

- Store in environment variables or secure vaults
- Never commit to version control
- Rotate regularly
- Use scoped keys when available

## Security Updates

Security updates are released as patch versions. Subscribe to GitHub releases to receive notifications.

---

_Last updated: 2026-04-17_
