---
'nexus-agents': major
---

Make `OpenAIAdapterConfig.fetchOptions` use the direct undici 6 dispatcher type, fixing public declaration imports in TypeScript consumers that include both DOM and Node libraries.

This narrows the public type contract. Previously, a Node-only consumer could assign an ambient `undici-types` 7 dispatcher; the gateway's undici 6 dispatcher was rejected by that ambient type. The config now accepts the dispatcher from undici 6, which the gateway already constructs, and no longer accepts the previously accepted Node 7 shape.

To migrate an injected dispatcher, use `Agent` or `ProxyAgent` from undici 6 (the tested version is 6.29.0), rather than an ambient Node 7 dispatcher:

```diff
 import type { OpenAIAdapterConfig } from 'nexus-agents';
-import type { Dispatcher } from 'undici-types'; // ambient Node 7 type
-declare const dispatcher: Dispatcher;
+import { ProxyAgent } from 'undici'; // install undici@6.29.0
+const dispatcher = new ProxyAgent('http://127.0.0.1:8080');

 const fetchOptions: OpenAIAdapterConfig['fetchOptions'] = { dispatcher };
```

Gateway proxy selection, authentication, host guards and SDK forwarding keep their existing runtime behavior. This does not establish undici 7/8 dispatcher support. Separate Node-only compilation still reports the bundled SDK's missing `HeadersInit` declaration; that failure is not resolved by this change.
