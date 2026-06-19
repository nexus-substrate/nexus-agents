---
'nexus-agents': minor
---

refactor(tool-fitness): declarative break-glass + orthogonality metadata, replacing name-string heuristics (#3930)

Replace the two NAME-STRING heuristics in the tool-fitness consumer with
DECLARATIVE TOOL METADATA, ratified per #3929.

- **Break-glass exemption** no longer relies on substring-matching
  `DEFAULT_NEVER_DEPRECATE_PATTERNS` (rollback/recover/emergency/…) against a
  tool NAME. Tools now DECLARE `neverDeprecate: true` in `TOOL_MANIFEST` based on
  PURPOSE; the consumer consults the declaration first and keeps the name
  patterns only as a documented fallback for undeclared tools.
- **Consolidation orthogonality** no longer infers substitutability from a
  tool-name verb-suffix proxy. Tools now DECLARE an `orthogonalityGroup`; two
  prefix-siblings with different declared groups are authoritatively orthogonal.
  The verb-group proxy remains as the fallback for undeclared tools (the old
  `TODO(#3902)` is superseded). Conservative fail-safe preserved: undeclared
  still surfaces-as-LOW, never a false-high.

Metadata lives on the canonical `TOOL_MANIFEST` entries (new optional
`ToolFitnessMetadata` fields) with derived accessors; all fields are
optional/additive so the MCP tool-count + parity guards are unaffected
(46 tools, unchanged).
