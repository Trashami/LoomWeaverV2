-- Store catalog: listings are derived from the source tables at query time (no synced listings table).
-- Ratings and acquisitions key on (source_table, source_key) because sources mix INT, string, and BIGINT keys.
-- Counts and averages are derived in queries, never stored.

DROP TABLE IF EXISTS `lw_store_acquisitions`;
DROP TABLE IF EXISTS `lw_store_ratings`;
DROP TABLE IF EXISTS `lw_store_listings`;

CREATE TABLE IF NOT EXISTS `lw_store_ratings` (
  `source_table` VARCHAR(64) NOT NULL,
  `source_key` VARCHAR(191) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`source_table`, `source_key`, `user_id`),
  KEY `ix_lw_store_ratings_user` (`user_id`),
  CONSTRAINT `ck_lw_store_ratings_range` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `fk_lw_store_ratings_user` FOREIGN KEY (`user_id`) REFERENCES `lw_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_store_acquisitions` (
  `source_table` VARCHAR(64) NOT NULL,
  `source_key` VARCHAR(191) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `acquired_via` VARCHAR(16) NOT NULL DEFAULT 'import',
  `acquired_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`source_table`, `source_key`, `user_id`),
  KEY `ix_lw_store_acquisitions_user` (`user_id`),
  CONSTRAINT `fk_lw_store_acquisitions_user` FOREIGN KEY (`user_id`) REFERENCES `lw_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
