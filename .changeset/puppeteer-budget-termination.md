---
'nexus-agents': patch
---

A Puppeteer run halted by the cost budget now reports `budget_exceeded` instead
of `max_steps`. `shouldTerminate` stops on `totalCost >= maxCostBudget`, but
`PuppeteerTerminationReason` had no member for it and
`determineTerminationReason` fell through to a trailing `return 'max_steps'` —
so a run stopped at step 6 of 50 by the wallet claimed it had exhausted its step
ceiling, and `processOrchestrationForLearning` was trained on that. The trailing
default is now `unknown` rather than a plausible-looking guess, and
`TerminationReasonSchema` (a second, uncompiled spelling of the same list) is
kept in step by a test.
