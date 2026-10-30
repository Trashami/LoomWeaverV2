-- Adds the payload_json column that LoreEntryRepository uses to persist lore tags and linked entity keys.
ALTER TABLE `lw_lore_entries` ADD COLUMN `payload_json` JSON NULL AFTER `archived`;
