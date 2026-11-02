-- Migration: lw_merchants and lw_campaign_roll_tables
-- Adds tables for campaign merchants, custom store inventories, transactions, wallets, and loot table attachments.
USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_merchants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  store_name VARCHAR(160) NOT NULL,
  merchant_name VARCHAR(160) NOT NULL DEFAULT '',
  tagline VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  greeting TEXT NOT NULL,
  image_url VARCHAR(500) NOT NULL DEFAULT '',
  banner_url VARCHAR(500) NOT NULL DEFAULT '',
  location_key VARCHAR(64) NULL,
  location_name VARCHAR(160) NOT NULL DEFAULT '',
  npc_key VARCHAR(64) NULL,
  npc_name VARCHAR(160) NOT NULL DEFAULT '',
  roll_table_id BIGINT NULL,
  roll_table_name VARCHAR(160) NOT NULL DEFAULT '',
  buy_rate_percent INT NOT NULL DEFAULT 50,
  markup_percent INT NOT NULL DEFAULT 100,
  is_unlocked TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_merchant_campaign (campaign_id),
  KEY ix_merchant_loc (campaign_id, location_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_merchant_inventory (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id BIGINT UNSIGNED NOT NULL,
  item_key VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  item_type VARCHAR(64) NOT NULL DEFAULT 'Item',
  rarity VARCHAR(32) NOT NULL DEFAULT 'common',
  description TEXT NOT NULL,
  base_value_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 1,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  properties_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_inventory_merchant (merchant_id),
  CONSTRAINT fk_merchant_inv FOREIGN KEY (merchant_id) REFERENCES lw_merchants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_merchant_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  merchant_id BIGINT UNSIGNED NOT NULL,
  campaign_id BIGINT UNSIGNED NOT NULL,
  character_key VARCHAR(64) NOT NULL,
  character_name VARCHAR(128) NOT NULL,
  transaction_type VARCHAR(16) NOT NULL,
  item_name VARCHAR(160) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  used_party_funds TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_tx_merchant (merchant_id),
  KEY ix_tx_campaign_char (campaign_id, character_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_campaign_roll_tables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  roll_table_id BIGINT NOT NULL,
  table_name VARCHAR(160) NOT NULL DEFAULT '',
  source_book VARCHAR(64) NOT NULL DEFAULT '',
  session_id VARCHAR(64) NULL,
  session_title VARCHAR(160) NOT NULL DEFAULT '',
  merchant_id BIGINT UNSIGNED NULL,
  merchant_name VARCHAR(160) NOT NULL DEFAULT '',
  notes TEXT NULL,
  is_pinned TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_crt_campaign (campaign_id),
  KEY ix_crt_session (campaign_id, session_id),
  KEY ix_crt_merchant (merchant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_wallets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  wallet_type VARCHAR(16) NOT NULL,
  owner_key VARCHAR(64) NOT NULL,
  gold_gp DECIMAL(10,2) NOT NULL DEFAULT 100.00,
  silver_sp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  copper_cp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wallet (campaign_id, wallet_type, owner_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
