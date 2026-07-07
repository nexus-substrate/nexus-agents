// Fixture for the command-exec-go ast-grep rule.
//
// One rule-hit per statement keeps the red/green test assertions (ruleId +
// line number) stable across edits. Generic sample data only (input, x) —
// no project- or vendor-specific names.
package fixtures

import "os/exec"

// PositiveDirectCall shells out via the standard library exec.Command —
// POSITIVE: command-exec-go.
func PositiveDirectCall(input string) {
	exec.Command("sh", "-c", input) // POSITIVE: command-exec-go (exec.Command)
}

// Command is a local helper of the SAME NAME as the stdlib call, but it is
// not `exec.Command` (no selector on the `exec` package) — must NOT match.
func Command(x string) string {
	return x // NEGATIVE: local `Command(...)` helper, not `exec.Command`
}

// NegativeLocalHelper calls the local helper above directly — NEGATIVE.
func NegativeLocalHelper(x string) string {
	return Command(x) // NEGATIVE: bare `Command(...)` call, no `exec.` selector
}

// NegativeAliasedNearMiss calls a `.Command(...)` method through a package
// alias that is NOT literally named `exec` — the ast-grep pattern matches on
// the literal identifier `exec`, so an aliased or differently-named package
// must not match.
func NegativeAliasedNearMiss(input string) {
	myexec.Command("sh", "-c", input) // NEGATIVE: object is `myexec`, not `exec`
}
