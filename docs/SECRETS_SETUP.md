# Repository Secrets Configuration

This guide documents the repository secrets required for nexus-agents workflows.

## Required Secrets for PR Review (Issue #176)

The project supports two PR review approaches:

1. **Claude Code Action** (`.github/workflows/claude-review.yml`) - Official Anthropic GitHub Action
2. **Nexus Agents Review** (`.github/workflows/nexus-review.yml`) - Custom nexus-agents workflow

Both require the `ANTHROPIC_API_KEY` secret.

### Anthropic API Key (Required)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create or retrieve an API key
3. In your GitHub repository:
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your API key (starts with `sk-ant-`)

### Option 2: OpenAI API Key (Alternative)

1. Go to [platform.openai.com](https://platform.openai.com)
2. Create or retrieve an API key
3. In your GitHub repository:
   - Navigate to **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `OPENAI_API_KEY`
   - Value: Your API key (starts with `sk-`)

### Verification

After configuring secrets:

1. Create a test PR
2. Check the **Actions** tab
3. The "Multi-Agent Review" job should run successfully
4. A review comment should appear on the PR

### Cost Estimation

Average cost per PR review:

- Claude Sonnet: ~$0.05-0.15 per review
- GPT-4: ~$0.10-0.25 per review
- Claude Haiku: ~$0.01-0.03 per review

### Troubleshooting

**Error: "No API keys configured"**

- Verify secret names are exact: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- Check secret is added to repository, not organization

**Error: "Authentication failed"**

- Verify API key is valid and not expired
- Check billing status on provider dashboard

**Error: Rate limited**

- Wait and retry, or use a different model tier
- Consider API key with higher rate limits

---

_Last updated: 2026-01-11 (ET)_
