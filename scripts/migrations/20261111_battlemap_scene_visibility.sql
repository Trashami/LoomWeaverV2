-- Scene visibility for VTT hand-off: 'gm' (GM only), 'players' (default), 'public'.
-- Existing scenes default to 'players'. This ALTER is not idempotent; apply once.
ALTER TABLE `lw_battlemap_scenes`
  ADD COLUMN `visibility` VARCHAR(16) NOT NULL DEFAULT 'players',
  ADD CONSTRAINT `chk_lw_battlemap_scenes_visibility` CHECK (`visibility` IN ('gm', 'players', 'public'));
