---
paths: '**/*.ts'
---

# Security Rules

## Secrets

- Never log secrets or include in error messages
- Use SecretsVault pattern, not raw process.env
- Sanitize all output before returning

## Input Validation

- Validate ALL inputs at boundaries with Zod
- No user-provided RegExp (use static patterns only)
- Validate paths to prevent traversal

```typescript
// Path validation pattern
function validatePath(userPath: string, root: string): Result<string, Error> {
  const resolved = path.resolve(root, userPath);
  if (!resolved.startsWith(path.resolve(root))) {
    return { ok: false, error: new Error('Path traversal') };
  }
  return { ok: true, value: resolved };
}
```

## Rate Limiting

- Apply rate limits to all public tools
- Use token bucket algorithm
- Log rate limit violations

## Memory Safety

- Bound all collections (max size)
- Implement context pruning
- Set timeouts on external calls
