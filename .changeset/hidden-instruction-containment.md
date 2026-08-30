---
'nexus-agents': patch
---

fix(security): keep the hidden_instruction detector inside a single HTML comment

The pattern was `<!--[\s\S]*?(?:execute|delete|merge|apply)[\s\S]*?-->`. The lazy
`[\s\S]*?` crosses an intervening `-->`, so **any** text containing an opening
comment, a trigger word anywhere in ordinary prose, and a later closing comment
matched. A real PR body like:

```
<!-- header -->
safe to merge after CI
<!-- footer -->
```

was flagged as an injection attempt.

That became load-bearing when #5251 gave `pr_review` `securityTier: 'external'`,
which converts a detection into a hard `permission` refusal with **no fallback**
— so a false positive means the tool declines to review the PR at all.

Now uses the tempered-dot form `(?:(?!-->)[\s\S])*?`, so the trigger must sit
inside one comment. Hostile detection is unchanged, verified in both directions:
reverting the regex fails the benign tests, and disabling the detector fails the
hostile controls.

**Partial fix, stated plainly.** GitHub's default PR template contains
`<!-- Please delete options that are not relevant -->`, where the trigger word
genuinely is inside a single comment — containment cannot help, because the
trigger vocabulary overlaps ordinary English. That case, and the fact that the
CI PR-review path bypasses the tier entirely, remain open in #5258.
