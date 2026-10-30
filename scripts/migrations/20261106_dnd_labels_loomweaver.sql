-- Map background source labels that have no 5etools code to LoomWeaver.
-- Official rows only (is_canonical = 1, owner_id NULL); custom rows are never touched.
-- Labels came from the custom-table merge that loaded dnd_custom_backgrounds into this table.

UPDATE `dnd_backgrounds`
SET `source_book` = 'LoomWeaver'
WHERE `is_canonical` = 1
  AND `owner_id` IS NULL
  AND `source_book` IN (
    'Heroes & Adventurers',
    'Locathah Rising & Legends',
    'LoomWeaver Campaign Setting',
    'ALCurseOfStrahd',
    'ALElementalEvil',
    'ALRageOfDemons'
  );
