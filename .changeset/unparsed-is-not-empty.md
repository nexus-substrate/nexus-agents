---
'nexus-agents': patch
---

`extract_symbols` now says whether it read the file ([#4517](https://github.com/nexus-substrate/nexus-agents/issues/4517)).

Both empty outcomes shared one message:

```
No symbols found (file may not be TypeScript/JavaScript)
```

It was wrong in the case that prompted this. `src/exports/benchmarks.ts` is a valid TypeScript file; it returns no symbols because all 20 of its exports are re-exports, which declare nothing locally. The parenthetical sent a reader looking for a file-type problem that did not exist.

These are different facts:

- **Not parsed** — the extension is unsupported, so the file was never read. Nothing is claimed about its contents.
- **Parsed, no declarations** — the file was read and genuinely declares nothing locally, typically a re-export barrel.

That is the same unmeasured-versus-measured-zero distinction the governance rules already require of a gate, applied to a tool an agent uses to decide whether to go read the file itself.

`extractSymbolIndexResult()` now returns either an index or a reason, and the tool renders each accordingly — naming the supported extensions when it could not parse, and naming the re-export case when it could. `SymbolExtractionResult` gains `parsed`.

The superseded `extractSymbolIndex()` is removed (internal, no external consumers); it returned a bare `''` for both cases and so could not tell a caller which had happened.

Also corrects `symbol-extractor.test.ts`'s header, which described the suite as validating "tree-sitter AST symbol extraction". There is no tree-sitter in the tree — extraction runs on the TypeScript compiler API. Adding tree-sitter for non-TS languages is the remaining, larger part of #4517.
