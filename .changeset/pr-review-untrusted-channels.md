---
'nexus-agents': patch
---

Two untrusted-input channels in the PR reviewer are now measured. The EXTERNAL CONTENT envelope around PR diffs could be terminated by the diff content itself, because the sanitizer has no reason to know about the envelope's own markers; forged markers are neutralized and raise an injection signal. The PR title was excluded from the injection scan that decides the enforced trust tier, so the same payload demoted an author from the body and raised nothing from the title — title and body are now scanned together, as the firewall's GitHub adapter already did.
