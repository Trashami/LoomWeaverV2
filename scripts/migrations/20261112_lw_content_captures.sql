-- Loom memory for the universal create page. Every save from /create writes one capture row
-- and one link row per related entity, so the Loom can answer "what did I write, and what is it connected to".
-- Applied manually over SSH (see scripts/apply_provisioning.py pattern).

USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_content_captures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  capture_key VARCHAR(96) NOT NULL,
  campaign_id INT NOT NULL,
  intent VARCHAR(40) NOT NULL,
  template_key VARCHAR(60) NOT NULL DEFAULT '',
  target_kind VARCHAR(40) NOT NULL DEFAULT '',
  target_key VARCHAR(190) NOT NULL DEFAULT '',
  title VARCHAR(200) NOT NULL,
  body_html LONGTEXT NULL,
  body_text LONGTEXT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'gm',
  author_username VARCHAR(120) NOT NULL DEFAULT '',
  source_route VARCHAR(255) NOT NULL DEFAULT '',
  payload_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY ux_lw_content_captures_key (capture_key),
  KEY ix_lw_content_captures_campaign (campaign_id, created_at),
  KEY ix_lw_content_captures_intent (campaign_id, intent),
  CONSTRAINT chk_lw_content_captures_visibility CHECK (visibility IN ('gm', 'players', 'public'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lw_content_capture_links (
  capture_key VARCHAR(96) NOT NULL,
  linked_composite_key VARCHAR(190) NOT NULL,
  relation VARCHAR(40) NOT NULL DEFAULT 'mentions',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (capture_key, linked_composite_key, relation),
  KEY ix_lw_content_capture_links_target (linked_composite_key),
  CONSTRAINT fk_lw_content_capture_links_capture FOREIGN KEY (capture_key) REFERENCES lw_content_captures (capture_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
