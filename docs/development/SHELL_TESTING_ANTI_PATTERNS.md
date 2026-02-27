---
title: Shell Testing Anti-Patterns
description: Common shell testing pitfalls — bash -c scoping, jq alternatives, env var assignments
tier: 2
keywords: [shell, testing, bash, anti-patterns, ci, debugging]
---

# Shell Testing Anti-Patterns

**Status:** Canonical | **Source:** Agent-sandbox retrospective (#1209)

Common shell testing pitfalls discovered during the agent-sandbox project (v3.0.0–v3.2.0). These anti-patterns caused real CI failures and are documented here to prevent recurrence.

---

## 1. Function Scoping in `bash -c` Subshells

**Problem:** Functions defined in the parent shell are not available inside `bash -c` subshells. This is because `bash -c` spawns a new process with no inherited function definitions.

```bash
# BAD — function not available in subshell
run_helper() { echo "result"; }
check "helper works" bash -c "result=$(run_helper) && test -n '$result'"
# Error: run_helper: command not found
```

**Fix:** Call the function in the parent shell first, capture the result, then assert.

```bash
# GOOD — pre-capture before assertion
run_helper() { echo "result"; }
result=$(run_helper)
check "helper works" test -n "$result"
```

**Root cause:** `bash -c` creates a fresh process. Only exported functions (`export -f`) survive, but `export -f` is fragile and non-portable. Pre-capturing is simpler and more reliable.

---

## 2. jq `//` Does Not Trigger for Empty Strings

**Problem:** jq's alternative operator (`//`) triggers for `null` and `false`, but NOT for empty string `""`. This silently passes when you expect a fallback.

```bash
# BAD — // does not trigger for ""
echo '{"owned_by": ""}' | jq -r '.owned_by // "unknown"'
# Output: "" (empty string, not "unknown")

# The // operator only triggers for null/false:
echo '{"owned_by": null}' | jq -r '.owned_by // "unknown"'
# Output: "unknown" ← this one works
```

**Fix:** Use explicit equality checks for empty strings.

```bash
# GOOD — explicit check
echo '{"owned_by": ""}' | jq -e '.owned_by == ""'

# Or use if/then/else
echo '{"owned_by": ""}' | jq 'if .owned_by == "" then "unknown" else .owned_by end'
```

**Root cause:** In jq, `//` is the "alternative" operator that replaces `null` and `false` only. An empty string is a valid truthy value in jq's type system.

---

## 3. Environment Variable Assignments in Positional Args

**Problem:** Shell test helpers that use `"$@"` to execute commands cannot handle inline environment variable assignments. The assignment becomes a positional argument, not a shell operation.

```bash
# BAD — env var assignment becomes a string argument
check_err "test fails" "expected error" ENV_FILE=/tmp/missing bash sandbox.sh decrypt
# Actually runs: ENV_FILE=/tmp/missing as first arg, bash as second arg

# BAD — even with explicit prefix
check_err "test fails" "expected error" "ENV_FILE=/tmp/missing bash sandbox.sh decrypt"
# Treats entire string as a single command
```

**Fix:** Wrap in `bash -c` to create a proper shell context for the assignment.

```bash
# GOOD — bash -c provides shell context for env assignment
check_err "test fails" "expected error" bash -c "ENV_FILE=/tmp/missing bash sandbox.sh decrypt"
```

**Root cause:** `VAR=value command` is shell syntax, not a command. When the test helper executes `"$@"`, it calls `exec()` directly — there's no shell to interpret the assignment syntax. Wrapping in `bash -c` provides that shell layer.

---

## General Guidelines

1. **Prefer environment variable overrides** over sed patching in tests
2. **Pre-capture function results** before passing to assertion helpers
3. **Test jq filters** with both `null` and `""` inputs when handling missing data
4. **Use `bash -c`** when test commands need shell features (pipes, redirections, variable assignments)
5. **Copy required source files** (like `config.sh`) alongside scripts when testing in temp directories
