-- Durable, campaign-scoped full LoomMaps scene documents with optimistic revisions.
-- Apply only after the backend/frontend changes have been reviewed.
USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_battlemap_scenes (
  campaign_id    BIGINT UNSIGNED NOT NULL,
  scene_key      VARCHAR(64) NOT NULL,
  revision       INT NOT NULL DEFAULT 1,
  document_json  JSON NOT NULL,
  updated_by     VARCHAR(128) NOT NULL,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, scene_key),
  CONSTRAINT fk_lw_battlemap_scenes_campaign
    FOREIGN KEY (campaign_id) REFERENCES lw_campaigns (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
