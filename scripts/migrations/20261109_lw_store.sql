-- Store catalog: one listing per sellable/importable content row, keyed back to its source table.
-- Ratings and acquisitions are per user; counts and averages are derived, never stored.
-- Official content is owned by the LoomWeaver pseudo user; the client hides that credit.

CREATE TABLE IF NOT EXISTS `lw_store_listings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `content_type` ENUM('dice','adventure','one_shot','merchant','magic','item','feat','background','deck','other') NOT NULL,
  `source_table` VARCHAR(64) NOT NULL,
  `source_id` INT UNSIGNED NOT NULL,
  `owner_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(255) NOT NULL,
  `summary` TEXT NULL,
  `is_official` TINYINT(1) NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `price_cents` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lw_store_listings_source` (`source_table`, `source_id`),
  KEY `ix_lw_store_listings_type` (`content_type`, `is_public`),
  KEY `ix_lw_store_listings_owner` (`owner_id`),
  CONSTRAINT `fk_lw_store_listings_owner` FOREIGN KEY (`owner_id`) REFERENCES `lw_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_store_ratings` (
  `listing_id` INT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`listing_id`, `user_id`),
  KEY `ix_lw_store_ratings_user` (`user_id`),
  CONSTRAINT `ck_lw_store_ratings_range` CHECK (`rating` BETWEEN 1 AND 5),
  CONSTRAINT `fk_lw_store_ratings_listing` FOREIGN KEY (`listing_id`) REFERENCES `lw_store_listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_store_ratings_user` FOREIGN KEY (`user_id`) REFERENCES `lw_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_store_acquisitions` (
  `listing_id` INT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `acquired_via` ENUM('import','purchase','grant') NOT NULL DEFAULT 'import',
  `acquired_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`listing_id`, `user_id`),
  KEY `ix_lw_store_acquisitions_user` (`user_id`),
  CONSTRAINT `fk_lw_store_acquisitions_listing` FOREIGN KEY (`listing_id`) REFERENCES `lw_store_listings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_store_acquisitions_user` FOREIGN KEY (`user_id`) REFERENCES `lw_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
