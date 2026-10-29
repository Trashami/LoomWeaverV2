-- NOT APPLIED. Review before running.
-- Adds 5etools tables that have no structured home yet, plus the spell-to-class/source
-- relationship table built from data/spells/sources.json.
-- Loader: scripts/sync_5etools_extras_to_sql.py

USE loomweaver;

CREATE TABLE IF NOT EXISTS dnd_feats (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_book` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page` int DEFAULT NULL,
  `raw_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dnd_feats_name_source` (`name`, `source_book`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dnd_backgrounds (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_book` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page` int DEFAULT NULL,
  `raw_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dnd_backgrounds_name_source` (`name`, `source_book`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- life.json is already loaded into dnd_life_tables (lifeClass, lifeBackground, lifeTrinket); no table added here.

CREATE TABLE IF NOT EXISTS dnd_spell_source_lookup (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `spell_source` varchar(32) COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `spell_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `spell_id` bigint unsigned DEFAULT NULL,
  `relation_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_spell_source_lookup` (`spell_source`, `spell_name`, `relation_type`, `related_name`, `related_source`),
  KEY `idx_spell_source_lookup_spell_id` (`spell_id`),
  KEY `idx_spell_source_lookup_related` (`related_name`, `related_source`),
  CONSTRAINT `fk_spell_source_lookup_source` FOREIGN KEY (`spell_source`) REFERENCES dnd_sources (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_spell_source_lookup_spell` FOREIGN KEY (`spell_id`) REFERENCES dnd_spells (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
