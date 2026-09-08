---
'nexus-agents': patch
---

`doctor` can no longer print "Summary: 0 issue(s) found" while reporting itself unhealthy

The summary count and the health verdict were two hand-maintained lists of the
same terms, and they had drifted apart again. `isAllHealthy` fails on
`hasAuthMethod` and on a CLI whose `versionStatus === 'unsupported'`;
`totalIssues` counted neither. So either condition alone produced a summary line
that appears _only because something is wrong_ and says nothing is wrong:

- an installed, authenticated CLI on an unsupported version
- no CLIs detected (the `whenEmpty = false` case from #4581), including when an
  API key is configured

This is the same defect #4851 fixed once, by adding the terms that were missing
then. The count is now derived from a named list of failing terms rather than a
parallel arithmetic expression, so a term cannot be added to the verdict and
forgotten in the total. `hasAuthMethod` deliberately gets no row of its own —
whenever it fails with CLIs present, the per-CLI rows already count it.

Extracted to `cli/doctor-verdict-terms.ts`, since deciding what counts as a
problem is a different question from how a result is rendered.
