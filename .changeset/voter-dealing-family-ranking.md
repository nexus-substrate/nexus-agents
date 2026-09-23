---
'nexus-agents': patch
---

Gateway voter panels now seat each model family's best-ranked model first. Within a family, seats used to go to models in alphabetical id order, so `gpt-4o-mini` took OpenAI's first seat ahead of `gpt-4o`, and `claude-haiku` took Anthropic's ahead of `claude-opus`. Seat dealing now uses the same family ranking as the gateway family slots: tier first (flagship before mini/small), then the gateway's `/models` `created` stamp when every model in the family has one, then the version parsed from the id. Operator pins (`NEXUS_VOTER_MODEL_<ROLE>`) still win, and the assignment is still the same whatever order the gateway lists its models in.
