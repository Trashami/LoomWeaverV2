-- Unifies campaign membership on lw_campaign_members keyed to lw_auth_users ids
-- (the identity table login actually uses) and adds real invite tokens.
-- Run once: DROP FOREIGN KEY has no IF EXISTS in MySQL 8.4.
USE loomweaver;

ALTER TABLE lw_campaign_members DROP FOREIGN KEY fk_lw_camp_members_user;
ALTER TABLE lw_campaigns DROP FOREIGN KEY fk_lw_campaigns_gm;

CREATE TABLE IF NOT EXISTS lw_campaign_invites (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id    BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  member_role    ENUM('player','spectator') NOT NULL DEFAULT 'player',
  created_by     BIGINT UNSIGNED NOT NULL,
  max_uses       INT NOT NULL DEFAULT 10,
  use_count      INT NOT NULL DEFAULT 0,
  expires_at     DATETIME NULL,
  revoked_at     DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_lw_invite_token (token_hash),
  KEY ix_lw_invite_campaign (campaign_id),
  CONSTRAINT fk_lw_invite_campaign FOREIGN KEY (campaign_id) REFERENCES lw_campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing campaigns without any members would be unreachable under enforced
-- membership; give each its recorded GM a gm row (matched by auth_email).
INSERT IGNORE INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role)
SELECT c.id, a.id, a.email, 'gm'
FROM lw_campaigns c
JOIN lw_auth_users a ON a.email = 'jtromborg1@gmail.com'
WHERE NOT EXISTS (SELECT 1 FROM lw_campaign_members m WHERE m.campaign_id = c.id);
