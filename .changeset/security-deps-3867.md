---
'nexus-agents': patch
---

security: remediate Dependabot alerts (#3867)

Clear 16 of 17 open Dependabot alerts via pnpm `overrides` (all affected
packages are transitive). No direct dependencies needed bumping.

- `ws` → `>=8.21.0` (GHSA-96hv-2xvq-fx4p, high)
- `esbuild` → `>=0.28.1` (GHSA-gv7w-rqvm-qjhr high, GHSA-g7r4-m6w7-qqqr low)
- `hono` override bumped `>=4.12.18` → `>=4.12.21` (resolves 4.12.25;
  GHSA-xrhx-7g5j-rcj5, -f577-qrjj-4474, -3hrh-pfw6-9m5x, -2gcr-mfcq-wcc3)
- `dompurify` → `>=3.4.9` (resolves 3.4.10; GHSA-rp9w-3fw7-7cwq,
  -76mc-f452-cxcm, -r47g-fvhr-h676, -hpcv-96wg-7vj8, -gvmj-g25r-r7wr,
  -vxr8-fq34-vvx9)
- `protobufjs` override re-targeted `<7.5.5` → `<7.6.3` (GHSA-f38q-mgvj-vph7;
  `@google/genai` resolves its native 8.6.3, which is past the v8 patch line)
- `markdown-it` override bumped `>=14.1.1` → `>=14.2.0` (GHSA-6v5v-wf23-fmfq, dev)
- `js-yaml@>=4.0.0 <4.2.0` → `>=4.2.0` (GHSA-h67p-54hq-rp68, dev; v3.x
  consumer left untouched — outside the advisory range)

Not fixed: dompurify GHSA-x4vx-rjvf-j5p4 — no patch released upstream yet;
tracked for a follow-up once a fix ships.
