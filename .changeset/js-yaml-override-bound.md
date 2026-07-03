---
---

Bound the js-yaml pnpm override replacement range (`>=4.2.0` → `>=4.2.0 <5.0.0`) so full lockfile regenerations no longer resolve astro's `js-yaml ^4.1.1` to ESM-only js-yaml 5.x, which breaks `astro build` (`does not provide an export named 'default'`). No runtime package changes.
