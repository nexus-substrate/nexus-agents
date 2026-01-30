# ADR-0001: Architecture Decision Record Template

## Status

Accepted

## Context

The system mandate requires Architecture Decision Records (ADRs) for all consolidation decisions.

## Decision

Use this template for all ADRs:

```markdown
# ADR-XXXX: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-YYYY]

## Context

[Why is this decision needed? What problem are we solving?]

## Options Considered

### Option A: [Name]

- Pros: ...
- Cons: ...

### Option B: [Name]

- Pros: ...
- Cons: ...

## Decision

[Which option was chosen and why]

## Consequences

### Positive

- ...

### Negative

- ...

## Migration Steps

1. ...
2. ...

## References

- Issue: #XXX
- Related ADRs: ...
```

## Consequences

### Positive

- Consistent decision documentation
- Clear migration paths
- Traceable architecture evolution

### Negative

- Additional documentation overhead

## Migration Steps

1. Create ADR file in `docs/adr/`
2. Number sequentially (0002, 0003, ...)
3. Link from relevant issues
