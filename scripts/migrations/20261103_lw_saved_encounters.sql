-- NOT APPLIED. Review before running.
-- Moves the lw_saved_encounters DDL out of CampaignEncounterRepository.cs (it previously ran on every request).
-- campaign_id stays INT to match the table as it exists today; a later migration can align it with lw_campaigns(id) BIGINT UNSIGNED.

USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_saved_encounters (
  campaign_id INT NOT NULL,
  encounter_id VARCHAR(64) NOT NULL,
  payload LONGTEXT NOT NULL,
  PRIMARY KEY (campaign_id, encounter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
