# PR #6966: monotonic served-model diversity

Absent `servedModel` preserves origin/main's configured-model classification exactly, including unknown bare Claude aliases. A present report retains a seat's family only when its classified family matches the known configured family. Mismatches, unknown reports, and unknown configured families receive no credit. Bare Claude alias normalization applies only to the serving comparison. Reports are the gateway's own claims (#6952), and can only withhold credit, never grant a family. Vote-record validation and hashing were unchanged.

Tests were written first: 19 failures against the rejected PR implementation, then 79 passing focused tests. Regressions cover all-Claude plus a Gemini report, GPT plus bare configured aliases without reports, unknown reports, matching reports, served-only aliases, and missing configured models. A generated 3,600-panel grid covers all nine known families, four bare aliases, unknown and absent configured models, crossed with absent, matching, other-family and unknown reports. It asserts new-pass implies main-pass, plus equal verdicts when reports are absent, using literal origin/main classifications.

All seven requested gates passed:

| Gate                               | Result                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `pnpm run test:scripts --bail 0`   | 101 files; 2,313 passed, 1 skipped                                       |
| Relevant package tests, `--bail 0` | 4 audit files; 247 passed                                                |
| `pnpm typecheck`                   | 3/3 Turbo tasks successful, cached                                       |
| `pnpm typecheck:scripts`           | Passed                                                                   |
| `pnpm lint`                        | 3/3 Turbo tasks successful, cached                                       |
| `pnpm lint:scripts`                | Passed after removing a redundant comparison that exceeded complexity 10 |
| `pnpm api:check`                   | Passed; public API unchanged                                             |

Relevant package tests: vote-record, vote-record-store, vote-record-signature, and voter-keys-constraint. The focused suite also passed after the lint adjustment. Independent review of the actual diff and final adjustment found no defects. The generated grid does not generate owner signatures, abstentions, or unverifiable seats; existing tests cover those paths.

Mutation: saved the fixed file with `cp`, copied origin/main's diversity implementation into place, and ran all 79 focused tests with `--bail 0`. Result: exit 1, 3 failed and 76 passed. Failures were the signed gateway-substitution case, the unknown report withholding the only configured family, and Gemini configured with an unknown serving report. Restored the fixed file with `cp`; `cmp` returned 0, proving byte-identical restoration. Baseline: origin/main `9b1fa4d5cdaa60bb797a2ccd5955522bb783c919`.

A new commit uses the requested subject and both trailers. No amend, push, merge, or ratification performed. The pre-existing untracked `prompt.md` was left untouched. Raw gate, red/green, and mutation logs are in `/tmp/6951-checks/`.
