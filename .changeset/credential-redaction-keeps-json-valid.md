---
'nexus-agents': patch
---

Credential redaction now keeps JSON documents valid when they contain AWS or GCP credential fields (`aws_secret_access_key`, `aws_session_token`, `private_key`, `private_key_id`). Previously the shared credential patterns replaced the key, its quotes and the value as one span, so `sanitizeOutput`, `sanitizeErrorDetails` and the logger produced output that failed `JSON.parse`. Plain-text redaction is unchanged.

`sanitizeErrorDetails` also redacts secret-named JSON keys: `client_secret` and any other `*_secret` key, `secret_access_key`, `private_key` and `private_key_id`. Values of every JSON type are replaced, and so are keys in JSON that is encoded inside a string. Before this change, such fields were redacted only by accident. When an earlier AWS/GCP replacement broke the JSON, a `password=` rule ran on to the end of the text. Because the JSON now stays valid, that accidental coverage is gone, and the new key rule redacts these fields directly.

The logger's `password`, `api_key`, `secret` and `token` rules now replace only the value inside a JSON document. The key, its quotes and the field delimiters are kept, so `"aws_session_token":"[REDACTED]"` still parses. Outside JSON, these rules behave as before. Logged JSON may now show key names that used to be swallowed with their values. In both modules, a value opened by an escaped quote (`key=\"value\"` inside a JSON string) is redacted through its closing quote.
