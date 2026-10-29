-- Turn order state and per-turn movement for server-authoritative combat.
CREATE TABLE IF NOT EXISTS lw_combat_state (
  campaign_id INT NOT NULL PRIMARY KEY,
  round_number INT NOT NULL DEFAULT 1,
  active_token_key VARCHAR(96) NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @has_speed := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lw_combat_tokens' AND COLUMN_NAME = 'speed_feet');
SET @ddl := IF(@has_speed = 0,
  'ALTER TABLE lw_combat_tokens ADD COLUMN speed_feet INT NOT NULL DEFAULT 30',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
UPDATE lw_combat_tokens SET speed_feet = movement_feet WHERE speed_feet = 30 AND movement_feet <> 30;
