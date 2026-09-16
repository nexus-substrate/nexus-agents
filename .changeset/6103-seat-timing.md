---
'nexus-agents': minor
---

Every consensus seat now carries `timing.attempts` (#6103): per attempt, the CLI lane it ran on, how long it queued behind that lane's serialized calls, how long it ran, and whether it was the cross-CLI fallback. The `vote` summary prints `Seat timing (queued→ran): …; queued total Ns` beside the models line, so a slow panel can be attributed to lane queueing or to model time before a fallback lane is designed. Additive; the vote record is unchanged.
