-- Deck card catalog with per-deck refs, and owner scope for official vs custom rows.
-- Official rows: is_canonical = 1, owner_id NULL. Custom rows: is_canonical = 0, owner_id = users.id.
-- Loader: scripts/load_5etools_decks.py (decks + cards + refs), scripts/sync_5etools_extras_to_sql.py (feats, backgrounds).

USE loomweaver;

-- Card catalog: one row per card identity (name, set, source). deck_id is the first deck that lists the card.
ALTER TABLE dnd_deck_cards
  ADD COLUMN `is_canonical` tinyint(1) NOT NULL DEFAULT 1 AFTER `campaign_scope_key`,
  ADD COLUMN `owner_id` bigint DEFAULT NULL AFTER `is_canonical`,
  ADD COLUMN `owner_scope_key` bigint GENERATED ALWAYS AS (coalesce(`owner_id`, 0)) STORED AFTER `owner_id`,
  DROP INDEX `uq_card_identity`,
  ADD UNIQUE KEY `uq_card_identity` (`name`(80), `set_name`(80), `source_book`(32), `campaign_scope_key`, `owner_scope_key`);

-- Every deck ref to a card, in the same order as dnd_decks.cards_ref_json (ref_index).
-- replacement_raw keeps the JSON value (NULL when the key is absent).
-- replacement is the effective flag used by the draw rules: absent in JSON -> 0; unpopulated rows default to 1.
CREATE TABLE IF NOT EXISTS dnd_deck_card_refs (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `deck_id` bigint NOT NULL,
  `ref_index` int NOT NULL,
  `card_id` bigint NOT NULL,
  `copies` int NOT NULL DEFAULT 1,
  `replacement_raw` tinyint(1) DEFAULT NULL,
  `replacement` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_deck_card_ref` (`deck_id`, `ref_index`),
  KEY `ix_deck_card_ref_card` (`card_id`),
  CONSTRAINT `fk_deck_card_ref_deck` FOREIGN KEY (`deck_id`) REFERENCES `dnd_decks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_deck_card_ref_card` FOREIGN KEY (`card_id`) REFERENCES `dnd_deck_cards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Feats and backgrounds: same owner scope as the other dnd_* tables.
ALTER TABLE dnd_feats
  ADD COLUMN `is_canonical` tinyint(1) NOT NULL DEFAULT 1 AFTER `fluff_json`,
  ADD COLUMN `owner_id` bigint DEFAULT NULL AFTER `is_canonical`,
  ADD COLUMN `owner_scope_key` bigint GENERATED ALWAYS AS (coalesce(`owner_id`, 0)) STORED AFTER `owner_id`,
  DROP INDEX `uq_dnd_feats_name_source`,
  ADD UNIQUE KEY `uq_dnd_feats_identity` (`name`, `source_book`, `owner_scope_key`);

ALTER TABLE dnd_backgrounds
  ADD COLUMN `is_canonical` tinyint(1) NOT NULL DEFAULT 1 AFTER `updated_at`,
  ADD COLUMN `owner_id` bigint DEFAULT NULL AFTER `is_canonical`,
  ADD COLUMN `owner_scope_key` bigint GENERATED ALWAYS AS (coalesce(`owner_id`, 0)) STORED AFTER `owner_id`,
  DROP INDEX `uq_dnd_backgrounds_name_source`,
  ADD UNIQUE KEY `uq_dnd_backgrounds_identity` (`name`, `source_book`, `owner_scope_key`);
