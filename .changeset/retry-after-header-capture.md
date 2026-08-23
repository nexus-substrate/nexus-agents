---
'nexus-agents': patch
---

fix(adapters): read the HTTP `Retry-After` header instead of guessing from prose

`recordProviderQuotaExhaustion` accepts exactly one input — a retry horizon in
milliseconds — and #4605 wired the API arms to feed it. But the horizon was
parsed out of the error _message_, and `transformError` dropped the HTTP
response before anyone could read the header that actually carries it. So the
horizon only ever arrived for one vendor family:

| vendor    | horizon in the body       | reached the tracker |
| --------- | ------------------------- | ------------------- |
| OpenAI    | "Please try again in 20s" | yes; "632ms" no     |
| Anthropic | nothing at all            | no                  |
| Gemini    | `"retryDelay":"33s"`      | no                  |

Classification was never the problem — `isRateLimitText` matches a 429 on every
vendor. Two of the three arms simply had no horizon to report, so they recorded
nothing and graded `unmeasured` forever.

Both SDKs hand the response headers straight to the thrown error
(`@anthropic-ai/sdk` and `openai` as a `Headers` instance, the Vercel AI SDK as
`responseHeaders`), so the boundary is reachable without holding the response
open. `BaseAdapter.transformError` and `SdkAdapter.toErrorResult` now capture
the horizon there and park it on the `ModelError` context, which
`ModelToCliAdapter.toCliError` reads onto `CliError.retryAfterMs` — the very
input #4605 already threads into the tracker. No new plumbing past the capture.

`@google/genai` is the exception, and not by omission: its `ApiError` carries
`{message, status}` and no headers at all. It does stringify the whole response
body into the message, so Gemini's `google.rpc.RetryInfo` is added as a body
fallback, alongside the sub-second `"try again in 632ms"` phrasing the
second-granularity rule could never match. Body patterns are the fallback only;
`Retry-After` wins where both are present, so an arm cannot under-report an
hour-long outage because the prose mentioned 20 seconds.

Both legal header forms are handled: delta-seconds and an HTTP-date, the latter
resolved against the clock and clamped at 0 for a date already past. An absent
or unreadable value is **absent**, never 0 — a 0 horizon reads as "retry
immediately", which is a measurement, and substituting it for a field we could
not parse would report a vacuous default as a provider assertion. `Date.parse`
is lenient enough to turn `"12.5"` into a date in 2001, so the HTTP-date branch
is gated on the day-of-week prefix all three legal spellings share.

Only `retry-after` is ever read. `Authorization` and API keys ride in the same
bag, so the named field is extracted to a number at the boundary and no header
object travels inward, into a log, or onto an error.

Defaults are unchanged. `CapacityStageConfig.enforceHardLimits` still defaults
`false`, nothing starts excluding candidates, and per-vendor tests pin both
halves of the check: a 429 stating a durable horizon reaches `exhausted`, and a
429 stating nothing anywhere stays `unmeasured` — never `healthy`.
