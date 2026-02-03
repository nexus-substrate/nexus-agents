# Repository Secrets Configuration

This guide documents the repository secrets and GitHub Apps required for nexus-agents workflows.

## GitHub App Integration (Recommended)

This repository uses the official **Claude GitHub App** for PR review automation and interactive assistance.

### Installed Apps

| App                                      | Purpose                      | Status       |
| ---------------------------------------- | ---------------------------- | ------------ |
| [Claude](https://github.com/apps/claude) | Interactive @claude mentions | ✅ Installed |
| Claude for GitHub                        | PR review automation         | ✅ Installed |

### Features Enabled

With the GitHub Apps installed, you get:

1. **Automatic PR Review** - Code reviews on every PR open/sync
2. **Interactive Mode** - Mention `@claude` in any PR comment to:
   - Ask questions about the code
   - Request specific fixes
   - Get explanations of changes
   - Fix CI errors
3. **Progress Tracking** - Visual indicators showing Claude's status

### Usage Examples

```markdown
@claude What does this function do?

@claude Can you add error handling to this PR?

@claude Please explain the changes in src/agents/

@claude Fix the failing test in line 42
```

## Required Secrets

### ANTHROPIC_API_KEY (Required)

The GitHub Apps handle GitHub authentication, but you still need an Anthropic API key for Claude API access.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create or retrieve an API key
3. In your GitHub repository:
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your API key (starts with `sk-ant-`)

### Alternative: OpenAI API Key

For the nexus-agents custom workflow only:

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create or retrieve an API key
3. Add as repository secret: `OPENAI_API_KEY`

## npm Publishing (OIDC Trusted Publishing)

npm packages are published via **OIDC trusted publishing** — no stored tokens needed.

### How It Works

GitHub Actions authenticates directly with npm using short-lived OIDC tokens. The `id-token: write` permission in the workflow enables this. Provenance attestations are generated automatically.

### Configuration (one-time setup)

The trusted publisher is configured on npmjs.com (npm supports one trusted publisher per package):

1. Go to https://www.npmjs.com/package/nexus-agents/access
2. Under **Trusted Publishers**, configure GitHub Actions:
   - **Repository owner:** `williamzujkowski`
   - **Repository name:** `nexus-agents`
   - **Workflow filename:** `release.yml`
   - **Environment:** _(leave blank)_

Both automated (push to main) and manual (`workflow_dispatch`) publishing use `release.yml` as the single trusted workflow.

### Publish Triggers

| Trigger          | How                                               |
| ---------------- | ------------------------------------------------- |
| Automated        | Push to main with changesets → version PR → merge |
| Manual           | `gh workflow run release.yml`                     |
| Manual (dry run) | `gh workflow run release.yml -f dry_run=true`     |

### Troubleshooting npm Publish

**Error: "Unable to authenticate"**

- Verify trusted publisher config on npmjs.com matches the workflow filename exactly
- Ensure `id-token: write` permission is set in the workflow
- Check that the package exists on npm and is linked to this repo

**Error: "OIDC token not available"**

- Only cloud-hosted runners support OIDC (not self-hosted)
- Verify `permissions.id-token: write` is set at the job level

## Workflows

### Claude Code Assistant (`.github/workflows/claude-review.yml`)

| Job           | Trigger         | Description           |
| ------------- | --------------- | --------------------- |
| `auto-review` | PR open/sync    | Automatic code review |
| `interactive` | @claude mention | Interactive responses |

### Nexus Agents Review (`.github/workflows/nexus-review.yml`)

Custom multi-agent review using nexus-agents orchestration (optional).

## Verification

After configuring:

1. Create a test PR
2. Check the **Actions** tab for "Claude Auto Review" job
3. In a PR comment, type `@claude Hello!` to test interactive mode
4. Claude should respond with a comment

## Cost Estimation

Average cost per interaction:

| Action               | Estimated Cost |
| -------------------- | -------------- |
| PR Review (Sonnet)   | ~$0.05-0.15    |
| Interactive Response | ~$0.02-0.10    |
| Fix Implementation   | ~$0.10-0.30    |

## Troubleshooting

**Error: "No API keys configured"**

- Verify `ANTHROPIC_API_KEY` secret is set correctly
- Check secret is added to repository (not organization)

**Error: "@claude not responding"**

- Verify the Claude GitHub App is installed on the repo
- Check the Actions tab for workflow runs
- Ensure ANTHROPIC_API_KEY is valid

**Error: "Authentication failed"**

- Verify API key is valid and not expired
- Check billing status on Anthropic dashboard

**Error: Rate limited**

- Wait and retry
- Consider API key with higher rate limits

## References

- [Claude Code Action](https://github.com/anthropics/claude-code-action)
- [Claude GitHub App](https://github.com/apps/claude)
- [Claude Code Docs](https://code.claude.com/docs/en/github-actions)

---

_Last updated: 2026-02-03 (ET)_
