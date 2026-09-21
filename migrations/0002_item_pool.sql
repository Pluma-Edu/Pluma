-- Pool membership is many-to-many.
--
-- content_fingerprint is globally unique so the bank never stores the same
-- question twice. But item.generation_hash is one column, so an item that two
-- pools would both legitimately produce — "Yo ______ (hablar)." belongs in both
-- the difficulty-2 and the difficulty-3 preterite pool — could only belong to
-- whichever pool generated it first. The second pool then drew short and the
-- library could not fill its worksheet.
--
-- The fingerprint identifies CONTENT. A pool is a view over content. Those are
-- different things and need different tables.
--
-- item.generation_hash stays as provenance: the pool whose parameters first
-- produced this item.

CREATE TABLE item_pool (
  generation_hash text NOT NULL REFERENCES generation_pool(generation_hash) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  added_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_hash, item_id)
);
CREATE INDEX item_pool_item_idx ON item_pool (item_id);

-- Backfill from the provenance column.
INSERT INTO item_pool (generation_hash, item_id)
SELECT i.generation_hash, i.id
  FROM item i
  JOIN generation_pool p ON p.generation_hash = i.generation_hash
ON CONFLICT DO NOTHING;
