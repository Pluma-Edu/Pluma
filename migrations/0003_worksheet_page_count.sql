-- The library page tells a teacher how long the worksheet is before they
-- download it. Claiming "2 pages" and delivering 3 is the kind of small lie
-- that costs trust on the one surface where trust is all we have, so the count
-- is measured from the rendered PDF rather than estimated from item count.
ALTER TABLE worksheet ADD COLUMN page_count smallint;

-- A stable, human-quotable identifier for a worksheet's skill, derived from
-- where the skill sits in its course. Teachers paste these into lesson plans.
ALTER TABLE worksheet ADD COLUMN skill_code text;
