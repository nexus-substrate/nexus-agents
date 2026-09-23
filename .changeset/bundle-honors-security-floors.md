---
'nexus-agents': patch
---

Packages bundled inside the nexus-agents tarball now honor the repository's security version floors (#6488). The bundle was resolved by npm, which ignores the workspace's `pnpm.overrides`, so it could ship a version the workspace had already raised past: `fast-uri` was bundled at 3.1.8 while the floor is `>=4.1.3`. A bundled copy cannot be overridden from your own project, so the floor has to hold before publishing.

Publishing now translates the floors into npm `overrides` for the staged package, so the bundle resolves above them (`fast-uri` is now 4.2.1), and then checks every bundled package against every floor. A violation fails the release, naming the package path, its version and the floor it breaks. The `overrides` field appears in the published `package.json`; npm and pnpm read it only from a root project, so it does not change how your own dependencies resolve.

One effect you can see: the repository's `protobufjs` floor now reaches the bundled copy, so it resolves to 8.x instead of the 7.6.6 that npm picked from `@google/genai`'s `^7.5.4`. 8.x declares no install script, so a default install now carries three packages with install scripts (all bundled, none run by npm 12 or pnpm), down from four. The workspace has tested `@google/genai` on protobufjs 8 through the same floor.
