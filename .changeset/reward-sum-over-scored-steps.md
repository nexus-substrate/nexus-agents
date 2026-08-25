---
'nexus-agents': patch
---

stop the episode reward re-multiplying the steps it excluded

Excluding unmeasured steps from the reward mean left both consumers of that
mean multiplying it by `totalSteps`. That product was the reward sum while the
mean covered every step; once it covered only scored steps it became an
extrapolation, handing the policy back the contribution of exactly the steps
exclusion removed. Three scored steps averaging 0.8 out of four reported a
reward of 3.2 where the true sum is 2.4.

Both now multiply by `scoredSteps`, which was already on the metrics object and
unread.

The empty case is handled rather than defaulted: with no step reporting a
reward, the policy update is skipped instead of training on the zero that falls
out of an empty mean — and in `computeEpisodeReward` that zero was followed by
a completion bonus, so an episode with nothing measured produced a positive
reward.

The efficiency penalty stays on `totalSteps`. An unscored step was still
executed and paid for, and scoping the penalty to scored steps would make it
free — the same distortion in the other direction. A test pins that.
