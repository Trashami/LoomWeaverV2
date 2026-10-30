-- Merge homebrew/custom feat and background columns into the canonical tables.
-- dnd_custom_feats / dnd_custom_backgrounds are dropped by 20261107_retire_dnd_custom_feats_backgrounds.sql
-- after the backend switched to dnd_feats / dnd_backgrounds.
-- Official rows: is_canonical = 1, owner_id NULL, is_public = 1.
-- Custom (user-owned) rows will use is_canonical = 0 and owner_id = lw_users.id.

ALTER TABLE `dnd_feats`
  ADD COLUMN `description` mediumtext NULL,
  ADD COLUMN `image_path` varchar(500) NULL,
  ADD COLUMN `is_public` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `ability_score_increase_json` longtext NULL,
  ADD COLUMN `campaign_id` bigint NULL,
  ADD COLUMN `source_template_id` bigint NULL;

ALTER TABLE `dnd_backgrounds`
  ADD COLUMN `description` mediumtext NULL,
  ADD COLUMN `feature_name` varchar(255) NULL,
  ADD COLUMN `feature_desc` mediumtext NULL,
  ADD COLUMN `image_path` varchar(500) NULL,
  ADD COLUMN `languages_json` longtext NULL,
  ADD COLUMN `is_public` tinyint(1) NOT NULL DEFAULT 1,
  ADD COLUMN `campaign_id` bigint NULL,
  ADD COLUMN `source_template_id` bigint NULL;

-- Spells: official rows have no owner. owner_id becomes a numeric lw_users.id link.
UPDATE `dnd_spells` SET `owner_id` = NULL WHERE `is_canonical` = 1;
ALTER TABLE `dnd_spells` DROP INDEX `uq_spell_name_owner`;
ALTER TABLE `dnd_spells` MODIFY `owner_id` bigint NULL;
