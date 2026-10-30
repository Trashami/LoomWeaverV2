-- Retire the separate custom feat/background tables. Their rows were merged into
-- dnd_feats / dnd_backgrounds (20261105) and homebrew is now written there with
-- is_canonical = 0 and owner_id = lw_users.id.
-- Apply only after the backend that no longer reads these tables is live in prod.

DROP TABLE IF EXISTS `dnd_custom_feats`;
DROP TABLE IF EXISTS `dnd_custom_backgrounds`;
