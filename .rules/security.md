---
paths: ['**/*.ts', '**/*.tsx']
description: Auth, secrets, input validation, file-system ops, untrusted-input handling
---

# Security Rules

<!-- CANONICAL SOURCES:
  - CODING_STANDARDS.md Section 7
  - docs/architecture/SECURITY.md
-->

Quick reference for security patterns. **Full documentation:**

- [SECURITY.md](../../docs/architecture/SECURITY.md) - Threat model, sandbox, CVE mitigations
- [CODING_STANDARDS.md](../../CODING_STANDARDS.md#7-security-standards) - Implementation standards

## Critical Checklist

- [ ] No secrets in code, logs, or outputs
- [ ] Input validation with Zod at all boundaries
- [ ] Path traversal prevention on file ops
- [ ] No user-provided RegExp (ReDoS risk)
- [ ] Rate limiting on public interfaces
- [ ] Memory bounds on collections
- [ ] Timeout on external calls

## Secrets Pattern

```typescript
const vault = new SecretsVault();
const apiKey = vault.get('API_KEY');
logger.info('API key loaded', { keyPresent: !!apiKey }); // Safe
```

## Path Validation

```typescript
function validatePath(userPath: string, root: string): Result<string, Error> {
  const resolved = path.resolve(root, userPath);
  if (!resolved.startsWith(path.resolve(root))) {
    return { ok: false, error: new Error('Path traversal') };
  }
  return { ok: true, value: resolved };
}
```

## Per-Adapter Permission Posture

Each harness has its own access-control primitive; nexus-agents emits a
conservative default for the one it scaffolds:

- **OpenCode** — `nexus-agents init --opencode` writes a `permission` block
  into `opencode.json` (#2658): `bash` → `ask` (highest-risk surface),
  `edit` → `ask` for everything with `.env*` / `*.pem` / `*.key` / `id_rsa*`
  / `secrets/**` / `.git/**` **hard-denied** (deny patterns ordered after
  `"*"` because OpenCode resolves globs last-match-wins), `skill` → `allow`
  (trusted, in-repo, CI-validated content). Never overwrites an operator's
  existing `permission` block. See `buildDefaultPermissionBlock()` in
  `src/cli/init-opencode.ts`.
- **Claude Code** — `allowedTools` in the harness config; not emitted by
  nexus-agents scaffolding.
- **Codex** — `sandbox_mode` in `~/.codex/config.toml`; not emitted by
  nexus-agents scaffolding.

See [SECURITY.md](../../docs/architecture/SECURITY.md) for sandbox configuration.
