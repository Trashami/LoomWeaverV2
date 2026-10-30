-- Official content is owned by a pseudo LoomWeaver account instead of owner_id NULL.
-- The client hides the LoomWeaver credit, so the app does not claim content it did not create.
-- Only is_canonical = 1 rows are touched; user-owned custom rows are never modified.
-- Re-running is safe: the account insert is guarded and the UPDATEs only match NULL owners.

INSERT INTO `lw_users` (`email`, `username`, `display_name`, `role`)
SELECT 'content@loomweaver.app', 'LoomWeaver', 'LoomWeaver', 'creator'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `lw_users` WHERE `username` = 'LoomWeaver');

SET @lw_owner_id = (SELECT `id` FROM `lw_users` WHERE `username` = 'LoomWeaver' LIMIT 1);

UPDATE `dnd_actions` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_backgrounds` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_bastions` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_char_creation_options` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_conditions_diseases` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_cults_boons` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_custom_classes` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_custom_species` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_decks` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_deck_cards` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_deities` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_feats` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_items` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_languages` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_loot_tables` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_objects` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_optional_features` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_psionics` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_recipes` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_rewards` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_spells` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_subclasses` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_subraces` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_tables` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_traps_hazards` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_variant_rules` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
UPDATE `dnd_vehicles` SET `owner_id` = @lw_owner_id WHERE `is_canonical` = 1 AND `owner_id` IS NULL;
