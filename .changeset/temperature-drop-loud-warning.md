---
'nexus-agents': patch
---

Fail loudly when `temperature` is dropped for a model that rejects it (#4066 layer
3). Since #4061/#4062, the adapters silently omit `temperature` for Claude models
after Opus 4.6 and OpenAI reasoning models — but silently dropping a BEHAVIORAL
parameter is the canonical footgun: a determinism/consistency setting is ignored
with no signal (0.0 and 0.7 yield identical output).

The three temperature-sending adapters (native Claude, OpenAI-compatible gateway,
AI-SDK) now emit a structured WARNING the first time they drop `temperature` for a
given model — naming the model, stating the param was omitted and the request runs
at the provider default, and that temperature has no effect on that model.
Deduped once-per-model-per-process (repeats log at debug) so a multi-call voter
panel does not spam. This is the first slice of the epic #4066 "never drop a param
silently" invariant; the response-surfaced `warnings`, the
`MODEL_PARAMETER_UNSUPPORTED` error code, and the would-have-self-healed counter
remain tracked in #4069.
