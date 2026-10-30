-- A card ref is a replacement only when the JSON says replacement: true.
-- Absent or unpopulated values default to 0 (removed once drawn).
ALTER TABLE dnd_deck_card_refs
  MODIFY COLUMN `replacement` tinyint(1) NOT NULL DEFAULT 0;
