---
'nexus-agents': patch
---

Vote-record signing and verification now report an `ssh-keygen` refusal as a refusal even when `ssh-keygen` exits before reading its input. Previously the stdin write could lose that race and fail with `EPIPE`, which turned a "key unusable" refusal (exit 255 with ssh-keygen's stderr) into "ssh-keygen unavailable". An `EPIPE` with exit status 0, a missing binary, or a signal still reports `unavailable`.
