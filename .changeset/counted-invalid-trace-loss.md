---
'nexus-agents': minor
---

Count trace conversion and validation failures as `writerObserved.invalidDropped` without discarding subsequent valid rows. Validate retained rows with the canonical schema, keep invalid losses separate from foreign drops and eviction, and bound diagnostic warnings without logging event payloads.

New snapshots explicitly report zero or counted loss. Historical omission remains unknown (`null` in `query_trace`), although legacy conservation arithmetic accepts omission as zero. Weather retains validated logical joins but withholds its coverage ratio when invalid loss is nonzero or unknown; none of these measurements proves complete bus capture. This prerequisite does not enable producer origins, replay integration, worker execution or settlement evidence.

Reader compatibility: upgrade readers alongside writers. Existing strict readers reject the new metadata field, including explicit zero, as unmeasured; newer readers continue to accept historical metadata without inventing loss-free history. Historical files are not rewritten.
