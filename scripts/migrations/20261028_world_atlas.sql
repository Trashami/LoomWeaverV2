-- Run against loomweaver only. Full documents use optimistic revisions; canonical locations remain shared.
USE loomweaver;
CREATE TABLE IF NOT EXISTS lw_atlas_documents (
  campaign_id BIGINT UNSIGNED NOT NULL,
  atlas_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  revision INT NOT NULL,
  document_json JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(campaign_id,atlas_id),
  CONSTRAINT fk_lw_atlas_campaign FOREIGN KEY(campaign_id) REFERENCES lw_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
