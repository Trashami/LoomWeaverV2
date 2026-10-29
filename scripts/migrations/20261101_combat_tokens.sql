-- Server-authoritative combat state, scoped by campaign.
CREATE TABLE IF NOT EXISTS lw_combat_tokens (
  campaign_id INT NOT NULL,
  token_key VARCHAR(96) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role_label VARCHAR(120) NOT NULL DEFAULT '',
  faction VARCHAR(16) NOT NULL,
  initiative INT NOT NULL DEFAULT 0,
  current_hp INT NOT NULL,
  max_hp INT NOT NULL,
  armor_class INT NOT NULL,
  pos_x DOUBLE NOT NULL DEFAULT 0,
  pos_z DOUBLE NOT NULL DEFAULT 0,
  color_hex VARCHAR(9) NOT NULL DEFAULT '#49e892',
  action_used TINYINT(1) NOT NULL DEFAULT 0,
  bonus_used TINYINT(1) NOT NULL DEFAULT 0,
  reaction_used TINYINT(1) NOT NULL DEFAULT 0,
  movement_feet INT NOT NULL DEFAULT 30,
  revision INT NOT NULL DEFAULT 1,
  PRIMARY KEY (campaign_id, token_key),
  KEY ix_combat_tokens_initiative (campaign_id, initiative)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
