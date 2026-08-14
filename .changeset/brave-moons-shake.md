---
'nexus-agents': patch
---

Run quality-gate checks inside the target project (#4355)

`runCommandCheck` never set `cwd`, so every `run_quality_gate` check executed in the MCP server's own working directory. Three checks partly masked it by passing `projectDir` as an argument (`tsc --project`, `eslint <dir>`, `vitest --dir`), but `checkBuild` passed nothing at all — so `pnpm build` built whatever project happened to sit at that directory. Under a global install (`npx -y nexus-agents --mode=server`) that is arbitrary, meaning the build verdict described an unrelated project.

All four checks now execute in `projectDir`, and `checkBuild` takes it as a parameter.

This is the unambiguous half of #4355. The reported half — the gate hard-codes ESLint/vitest/pnpm and ignores the target's declared scripts, producing a false RED on an oxlint/npm project — is decided (7/0, Option A) and tracked there.
