-- Name-based 3D model variants. Files live on disk (served by nginx); MySQL stores only references.
-- Maps store base_name only; clients resolve {base_name}_{low|mid|high}.glb by quality setting.
-- NOT APPLIED. Review before running.
USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_asset_models (
  base_name      VARCHAR(128) NOT NULL PRIMARY KEY,
  display_name   VARCHAR(160) NOT NULL,
  category       VARCHAR(48) NOT NULL DEFAULT '3d-stamp',
  system_code    VARCHAR(32) NOT NULL DEFAULT 'system-neutral',
  entitlement    ENUM('free','included','purchased','locked') NOT NULL DEFAULT 'free',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- storage_ref is a path relative to the models root, e.g. models-3d/oak_mid.glb.
CREATE TABLE IF NOT EXISTS lw_asset_model_variants (
  base_name    VARCHAR(128) NOT NULL,
  quality      ENUM('low','mid','high') NOT NULL,
  storage_ref  VARCHAR(500) NOT NULL,
  byte_size    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256       CHAR(64) NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (base_name, quality),
  CONSTRAINT fk_lw_asset_model_variants FOREIGN KEY (base_name) REFERENCES lw_asset_models (base_name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
