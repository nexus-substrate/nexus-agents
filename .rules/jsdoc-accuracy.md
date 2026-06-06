---
paths: ['**/*.ts', '**/*.tsx']
description: Doc-comment accuracy — JSDoc must match real behavior; build-vs-drop on capability-revealing drift; verify findings against code before acting
---

# JSDoc / Doc-Comment Accuracy

Auto-loaded. A doc comment is a **claim about what the code does**. Stale or
overstated claims are bugs — they mislead the agents and humans who read them to
pick the wrong tool, expect a guarantee that isn't there, or design against
behavior that was removed. This rule exists because an audit (epic #3516) found
real instances: a tool advertising a `rollback` capability that didn't exist, a
default documented as the exact value a fix had removed, and a method whose doc
claimed selective behavior its code didn't have.

## Non-negotiables

1. **Describe actual behavior, not intent or history.** What the code does _now_.
   The accuracy rules in `eslint-plugin-jsdoc` (`check-param-names`, `check-types`,
   `check-tag-names`, `empty-tags`, `valid-types`, `check-alignment`,
   `check-property-names`) gate at **error** — `@param` names, types, and tags
   must match the signature. Don't disable them; fix the doc.

2. **A fix that changes behavior must sweep the surrounding docs.** When you
   change a default, a return shape, or what a function does, update its JSDoc
   _and_ any registered description / generated reference in the same change.
   (Tool descriptions live in two places — the registered `const description`
   and `scripts/tool-descriptions-data.ts`; until #3528 unifies them, change both.)

3. **Build-vs-drop on capability-revealing drift.** When a doc claims a capability
   the code lacks, decide deliberately: is the doc _wrong_ (delete the claim), or
   is it revealing an _intended_ capability the code should have? If the latter,
   file a tracked issue rather than silently deleting the aspiration — per the
   Mission's capability-bias. Don't reflexively delete.

4. **Verify doc-vs-code findings against the code before acting.** Whether a
   finding comes from you, a subagent, or an automated pass, re-read the cited
   lines and trace the code path before "fixing" — a plausible-but-wrong "this
   doc is stale" edit is itself a regression. (A subagent self-contradicted on a
   real finding this cycle; second-pass findings have a high false-positive rate
   per the Discovered-Issues 4-point gate.) Default to dropping borderline cases.

5. **Don't cite line numbers / symbols that can drift silently.** Prefer naming
   the symbol over `file:line` in long-lived comments; a refactor that moves the
   code leaves the citation pointing at the wrong place (the failure mode behind
   several stale findings). If you must cite a location, expect to update it when
   you touch that code.

## Scope

Applies to JSDoc on exported/public symbols first (the shipped `.d.ts` surface),
then internal helpers. Coverage (requiring docs everywhere) is a separate,
deliberately-deferred concern — this rule is about the _accuracy_ of docs that
exist, not their presence.
