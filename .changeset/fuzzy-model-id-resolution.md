---
'nexus-agents': minor
---

normalized/identity resolution tier for decorated gateway model ids

`ModelRegistry.getEntry` now retries an exact miss with the normalized id
(reusing `normaliseModelId`) and then identity-matches
{vendor, family, version} against loaded entries, so OpenAI-compatible
gateways exposing vendor models under decorated names
(`Claude_Opus_4.8_hardened`, `2025-claude-opus-4_0_high`) resolve to the
canonical entry's pricing/metadata instead of bare derivation. Matches grant
pricing/metadata ONLY — behaviour and request-shaping fields still derive
from the original id — and carry `matchedVia`/`resolvedFrom` provenance.
Tier-ordered uniqueness (manifest/in-tree before models-dev/generated) with
provider-prefix duplicate dedupe; ambiguity fails closed. `hasAuthoritative`
and `lookupInTreeCapability` stay exact-match.
