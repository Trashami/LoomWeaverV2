-- =============================================================================
-- LoomWeaver V2 Authoritative MySQL Schema & Seed ("loomweaver" database)
-- All data lives in "loomweaver"; the legacy "jane_scrum" schema is retired.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `loomweaver`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `loomweaver_test`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'loomweaver_app'@'%' IDENTIFIED BY '__LW_DB_PASSWORD__';
CREATE USER IF NOT EXISTS 'loomweaver_app'@'localhost' IDENTIFIED BY '__LW_DB_PASSWORD__';
GRANT ALL PRIVILEGES ON `loomweaver`.* TO 'loomweaver_app'@'%';
GRANT ALL PRIVILEGES ON `loomweaver`.* TO 'loomweaver_app'@'localhost';
GRANT ALL PRIVILEGES ON `loomweaver_test`.* TO 'loomweaver_app'@'%';
GRANT ALL PRIVILEGES ON `loomweaver_test`.* TO 'loomweaver_app'@'localhost';
FLUSH PRIVILEGES;

USE `loomweaver`;

-- 1. Subscription Tiers (ui-and-product-rules.md)
CREATE TABLE IF NOT EXISTS `lw_subscription_tiers` (
  `code` VARCHAR(32) NOT NULL PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `monthly_cents` INT NOT NULL DEFAULT 0,
  `annual_cents` INT NOT NULL DEFAULT 0,
  `max_active_campaigns` INT NOT NULL DEFAULT 1,
  `storage_limit_mb` INT NOT NULL DEFAULT 250,
  `includes_weave_ai` TINYINT(1) NOT NULL DEFAULT 0,
  `creator_royalty_pct` INT NOT NULL DEFAULT 85,
  `summary` VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Users
CREATE TABLE IF NOT EXISTS `lw_users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `display_name` VARCHAR(128) NOT NULL,
  `role` ENUM('gm', 'player', 'creator', 'admin') NOT NULL DEFAULT 'gm',
  `tier_code` VARCHAR(32) NOT NULL DEFAULT 'archweaver',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lw_users_tier` FOREIGN KEY (`tier_code`) REFERENCES `lw_subscription_tiers` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Campaigns
CREATE TABLE IF NOT EXISTS `lw_campaigns` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(160) NOT NULL,
  `subtitle` VARCHAR(255) NOT NULL,
  `system_code` ENUM('dnd5e', 'pf2e', 'vampire_v5') NOT NULL DEFAULT 'dnd5e',
  `gm_user_id` BIGINT UNSIGNED NOT NULL,
  `world_name` VARCHAR(128) NOT NULL,
  `current_act` VARCHAR(128) NOT NULL,
  `current_session_number` INT NOT NULL DEFAULT 1,
  `current_location_name` VARCHAR(128) NOT NULL,
  `weave_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lw_campaigns_gm` FOREIGN KEY (`gm_user_id`) REFERENCES `lw_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Campaign Entities (Bridged to Neo4j via {campaign_id}:{entity_type}:{entity_key})
CREATE TABLE IF NOT EXISTS `lw_entities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_type` ENUM('PlayerCharacter','NPC','Monster','Location','Faction','Quest','Artifact','Encounter','Session','Event','Secret','Clue','Claim','SourceRecord','Lore','Room','Scene','Chapter','Handout') NOT NULL,
  `entity_key` VARCHAR(64) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `subtitle` VARCHAR(160) NOT NULL DEFAULT '',
  `summary` TEXT NOT NULL,
  `visibility` ENUM('public', 'players', 'gm') NOT NULL DEFAULT 'players',
  `canon_status` ENUM('approved', 'draft') NOT NULL DEFAULT 'approved',
  `route_link` VARCHAR(255) NOT NULL DEFAULT '/campaigns',
  `metadata_json` JSON NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_entity_composite` (`campaign_id`, `entity_type`, `entity_key`),
  KEY `ix_lw_entities_visibility` (`campaign_id`, `visibility`),
  CONSTRAINT `fk_lw_entities_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Map Scenes (2D/3D Map Studio & VTT)
CREATE TABLE IF NOT EXISTS `lw_scenes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `scene_key` VARCHAR(64) NOT NULL UNIQUE,
  `name` VARCHAR(160) NOT NULL,
  `region_name` VARCHAR(128) NOT NULL,
  `mode_support` VARCHAR(64) NOT NULL DEFAULT '2D + 3D Linked',
  `grid_cols` INT NOT NULL DEFAULT 32,
  `grid_rows` INT NOT NULL DEFAULT 24,
  `biome` VARCHAR(64) NOT NULL DEFAULT 'Temperate Highland',
  `weather_preset` VARCHAR(64) NOT NULL DEFAULT 'Dusk Mist',
  `lighting_profile` VARCHAR(64) NOT NULL DEFAULT 'Torchlit Dynamic',
  `visibility` ENUM('public', 'players', 'gm') NOT NULL DEFAULT 'players',
  `revision` INT NOT NULL DEFAULT 1,
  `scene_config_json` JSON NULL,
  CONSTRAINT `fk_lw_scenes_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Assets & Marketplace Catalog (lw-asset-card contract)
CREATE TABLE IF NOT EXISTS `lw_assets` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `name` VARCHAR(160) NOT NULL,
  `category` ENUM('map-pack','3d-stamp','scatter-biome','dice-skin','spell-fx','audio-ambience','adventure-module') NOT NULL,
  `creator_name` VARCHAR(128) NOT NULL,
  `entitlement` ENUM('free', 'included', 'purchased', 'locked') NOT NULL DEFAULT 'free',
  `price_label` VARCHAR(32) NOT NULL DEFAULT 'Free',
  `price_cents` INT NOT NULL DEFAULT 0,
  `preview_url` VARCHAR(500) NULL,
  `summary` VARCHAR(255) NOT NULL,
  `system_code` VARCHAR(32) NOT NULL DEFAULT 'system-neutral',
  `tags_json` JSON NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Event-Backed Statistics (Damage, Nat20s, Last Hits, Radar Axes)
CREATE TABLE IF NOT EXISTS `lw_combat_telemetry` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `character_key` VARCHAR(64) NOT NULL,
  `character_name` VARCHAR(128) NOT NULL,
  `class_summary` VARCHAR(128) NOT NULL,
  `total_damage_dealt` INT NOT NULL DEFAULT 0,
  `damage_vs_dragons` INT NOT NULL DEFAULT 0,
  `damage_vs_undead` INT NOT NULL DEFAULT 0,
  `damage_vs_constructs` INT NOT NULL DEFAULT 0,
  `last_hits` INT NOT NULL DEFAULT 0,
  `natural_20_count` INT NOT NULL DEFAULT 0,
  `natural_1_count` INT NOT NULL DEFAULT 0,
  `healing_done` INT NOT NULL DEFAULT 0,
  `clues_discovered` INT NOT NULL DEFAULT 0,
  `radar_offense` INT NOT NULL DEFAULT 70,
  `radar_defense` INT NOT NULL DEFAULT 70,
  `radar_support` INT NOT NULL DEFAULT 70,
  `radar_control` INT NOT NULL DEFAULT 70,
  `radar_lore` INT NOT NULL DEFAULT 70,
  `radar_tactics` INT NOT NULL DEFAULT 70,
  UNIQUE KEY `uk_lw_telemetry_char` (`campaign_id`, `character_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Transactional Outbox for Neo4j Projections (New events begin pending: projected_to_neo4j = 0)
CREATE TABLE IF NOT EXISTS `lw_outbox_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `event_type` VARCHAR(64) NOT NULL,
  `composite_key` VARCHAR(160) NOT NULL,
  `payload_json` JSON NOT NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `projected_to_neo4j` TINYINT(1) NOT NULL DEFAULT 0,
  `retry_count` INT NOT NULL DEFAULT 0,
  `last_error` VARCHAR(500) NULL,
  `processed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `ix_lw_outbox_pending` (`projected_to_neo4j`, `campaign_id`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT INTO `lw_subscription_tiers` (`code`, `name`, `monthly_cents`, `annual_cents`, `max_active_campaigns`, `storage_limit_mb`, `includes_weave_ai`, `creator_royalty_pct`, `summary`) VALUES
('spark', 'Spark Free', 0, 0, 1, 250, 0, 85, 'Free forever player seat, The Loom campaign memory, 2D map export, and core character sheets.'),
('threadkeeper', 'Threadkeeper', 600, 6000, 3, 2048, 1, 85, 'GM campaign hosting, 2D/3D Map Studio, custom stamps, and The Loom deep-link memory.'),
('weaver', 'Weaver', 1200, 12000, 10, 10240, 1, 85, 'Full 3D VTT lighting & weather, Action/Effect Builder, The Weave AI draft companion, and Neo4j World Graph.'),
('archweaver', 'Archweaver', 2400, 24000, 999, 51200, 1, 85, 'Unlimited campaigns, creator marketplace publishing with 85/15 split, and priority 3D asset packs.')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `summary`=VALUES(`summary`);

INSERT INTO `lw_users` (`id`, `email`, `username`, `display_name`, `role`, `tier_code`) VALUES
(1, 'jtromborg1@gmail.com', 'GeoJason', 'Jason (Archweaver GM)', 'gm', 'archweaver'),
(2, 'player@loom-weaver.com', 'DalPlayer', 'Dal (Party View)', 'player', 'spark')
ON DUPLICATE KEY UPDATE `display_name`=VALUES(`display_name`), `tier_code`=VALUES(`tier_code`);

INSERT INTO `lw_campaigns` (`id`, `slug`, `name`, `subtitle`, `system_code`, `gm_user_id`, `world_name`, `current_act`, `current_session_number`, `current_location_name`, `weave_enabled`) VALUES
(1, 'shadow-of-the-mountain', 'Shadow of the Mountain', 'Six Luminaries, a bound dragon beneath the Southern Peaks, and the road to Cinth', 'dnd5e', 1, 'Icrandor', 'Act II: The Road to Cinth', 14, 'Cinth — Artificers Quarter', 1),
(2, 'echoes-of-starstone', 'Echoes of the Starstone', 'Absalom expedition into the shattered clockwork vaults', 'pf2e', 1, 'Golarion', 'Act I: Siege of the Spire', 6, 'Absalom Grand Bazaar', 1),
(3, 'court-of-velvet-ash', 'Court of Velvet Ash', 'Elysium intrigue, blood debts, and the Prince of the Harbor', 'vampire_v5', 1, 'Nocturne Domain', 'Coterie Chronicle III', 9, 'The Gilded Conservatory', 0)
ON DUPLICATE KEY UPDATE `subtitle`=VALUES(`subtitle`), `current_act`=VALUES(`current_act`);

-- Seed Canonical Entities for Campaign 1 (Icrandor / Shadow of the Mountain)
INSERT INTO `lw_entities` (`campaign_id`, `entity_type`, `entity_key`, `name`, `subtitle`, `summary`, `visibility`, `canon_status`, `route_link`, `metadata_json`) VALUES
(1, 'PlayerCharacter', 'pc-dal', 'Dal Riata', 'Elf Ranger / Lineage of Edhellain · Level 7', 'Observes patterns, hidden ambushes, and ancient elven architectural lies. Unbeknownst to the wider realm, carries the true royal lineage of Edhellain.', 'players', 'approved', '/characters?focus=pc-dal', JSON_OBJECT('ac', 17, 'hp', 62, 'maxHp', 62, 'levelUpEligible', true, 'system', 'dnd5e')),
(1, 'PlayerCharacter', 'pc-fivi', 'Fivi', 'Feywild Outcast Rogue / Warlock · Level 7', 'Wields a tooth-loaded slingshot and carries Dolly (with Kycius''s sewn pocket-maw). Masks deep fear of never belonging behind sideways fey logic.', 'players', 'approved', '/characters?focus=pc-fivi', JSON_OBJECT('ac', 16, 'hp', 51, 'maxHp', 51, 'levelUpEligible', true, 'system', 'dnd5e')),
(1, 'PlayerCharacter', 'pc-kildrid', 'Kildrid', 'Dwarven Cleric / Stone Scholar · Level 7', 'Reads stonework, runes, and structural history. Felt the hundred-year agony of the trapped dragon beneath the southern mountain from miles away.', 'players', 'approved', '/characters?focus=pc-kildrid', JSON_OBJECT('ac', 19, 'hp', 68, 'maxHp', 68, 'levelUpEligible', false, 'system', 'dnd5e')),
(1, 'PlayerCharacter', 'pc-kycius', 'Kycius', 'Tabaxi Arcane Investigator · Level 7', 'Watches for hidden truth. Bonded to Laksis, a small fire drake. Sewed the non-lethal dimensional pouch inside Dolly''s mouth for Fivi.', 'players', 'approved', '/characters?focus=pc-kycius', JSON_OBJECT('ac', 16, 'hp', 54, 'maxHp', 54, 'levelUpEligible', false, 'system', 'dnd5e')),
(1, 'PlayerCharacter', 'pc-munk', 'Munk', 'Half-Orc Vanguard Fighter · Level 7', 'Brings physical courage and blunt-force clarity to the front line. Raised and trained by an old master in his home village near the northern route.', 'players', 'approved', '/characters?focus=pc-munk', JSON_OBJECT('ac', 18, 'hp', 79, 'maxHp', 79, 'levelUpEligible', true, 'system', 'dnd5e')),
(1, 'NPC', 'npc-emrys', 'Emrys Driothe', 'Reformer of the New Council of Magic', 'Presents himself at the Lord of Cinth''s gala as a benevolent reformer opening magic education to all classes.', 'players', 'approved', '/campaigns?inspect=npc-emrys', JSON_OBJECT('role', 'Council Reformer', 'location', 'Cinth Gala Hall')),
(1, 'NPC', 'npc-kutler', 'Captain Kutler', 'Skyship Commander · Lost Isles Investigator', 'Returned from the Lost Isles piloting a brass-and-canvas artificer skyship with urgent intelligence on Chokrah rituals and the Priors.', 'players', 'approved', '/campaigns?inspect=npc-kutler', JSON_OBJECT('role', 'Skyship Captain', 'location', 'Cinth Sky-Dock')),
(1, 'Monster', 'mon-bound-dragon', 'Vaelkorath, The Bound Dragon Under the Mountain', 'Ancient Dragon · Bound by Runes & Life-Tether', 'Trapped beneath the southern mountain during the Moonlight Wars. Its claws have worn down and regrown for a century clawing at the containment runes.', 'gm', 'approved', '/encounters?focus=enc-mountain-caves', JSON_OBJECT('cr', '19', 'ac', 20, 'hp', 310)),
(1, 'Location', 'loc-cinth', 'City of Cinth', 'Inland Metropolis near the Plains of Vistagh', 'A seat of high nobility, vampire infiltration at the Lord''s gala, and the rising Artificers Guild.', 'players', 'approved', '/maps?scene=scene-cinth-gala', JSON_OBJECT('region', 'Plains of Vistagh')),
(1, 'Location', 'loc-vandia', 'Vandia & The Cliff House', 'Southwest Coast · Bay of Forgotten Treasures', 'Coastal port city and the party''s cliffside house near the marked triangle route to the Well of Life.', 'players', 'approved', '/maps?scene=scene-vandia-cliff', JSON_OBJECT('region', 'Southwest Coast')),
(1, 'Location', 'loc-plains-red', 'The Plains of Red', 'Bloodied Corridor between Fey Forest and Southern Peaks', 'Named for the slaughter of fey by men a thousand years ago along the northeast road to Cinth.', 'players', 'approved', '/maps?scene=scene-plains-red', JSON_OBJECT('region', 'Central Corridor')),
(1, 'Faction', 'fac-artificers', 'Artificers Guild of Cinth', 'Post-Moonlight Wars Craft & Engine Collective', 'Non-magical engineers and inventors building brass, clockwork, and arcane-capacitor defenses so ordinary people are never helpless before mages again.', 'players', 'approved', '/campaigns?inspect=fac-artificers', JSON_OBJECT('disposition', 'Allied')),
(1, 'Faction', 'fac-priors', 'The Order of Priors', 'Corrupted Street-School of Ekkos', 'Publicly rescues street children and teaches discipline; secretly siphons innate magic from students through Chokrah rituals.', 'gm', 'approved', '/campaigns?inspect=fac-priors', JSON_OBJECT('disposition', 'Hostile Secret')),
(1, 'Quest', 'quest-cinth-gala', 'Invitation to the Lord of Cinth''s Masquerade', 'Active Main Story Thread · Act II', 'Attend the Lord of Cinth''s high reception, uncover the vampire coup targeting the city nobility, and meet the Council reformer Emrys.', 'players', 'approved', '/campaigns?inspect=quest-cinth-gala', JSON_OBJECT('status', 'Active', 'xpReward', 4500)),
(1, 'Quest', 'quest-chokrah-ledger', 'The Chokrah Cargo & Priors Ledger', 'Investigation Thread · Act II', 'Trace the smuggled Chokrah shipments from the Lost Isles to the Council''s Prior academies with Captain Kutler.', 'players', 'approved', '/campaigns?inspect=quest-chokrah-ledger', JSON_OBJECT('status', 'Active', 'xpReward', 3200)),
(1, 'Artifact', 'art-luminary-well', 'Luminary of the Well of Life', 'Remnant of the Anelith · Sidhe Ard Creation Core', 'One of six hexagonal creation remnants left when the Sidhe Ard wove life through the Anelith. Carried by the party.', 'players', 'approved', '/assets?inspect=art-luminary-well', JSON_OBJECT('rarity', 'Artifact')),
(1, 'Encounter', 'enc-cinth-ballroom', 'Blood on the Masquerade Glass', 'Hard Encounter · 6 Combatants · Cinth Ballroom', 'Cinth''s noble coven strikes during the third waltz while Emrys observes the party''s capabilities.', 'players', 'approved', '/encounters?focus=enc-cinth-ballroom', JSON_OBJECT('difficulty', 'Hard', 'round', 3)),
(1, 'Encounter', 'enc-mountain-caves', 'Runes of the Bound Dragon', 'Deadly Boss Encounter · Southern Mountain Cavern', 'The deceptive diversion into the runed cavern beneath the mountain where Vaelkorath claws at his century-old prison.', 'gm', 'approved', '/encounters?focus=enc-mountain-caves', JSON_OBJECT('difficulty', 'Deadly', 'round', 1)),
(1, 'Session', 'ses-14', 'Session 14: Brass Gears & Velvet Fangs', 'Recorded Session Chronicle · Act II', 'The party arrived in Cinth, befriended the Artificers Guild, tested Kycius''s new pocket-maw inside Dolly, and entered the Lord''s gala.', 'players', 'approved', '/campaigns?session=ses-14', JSON_OBJECT('sessionNumber', 14)),
(1, 'Secret', 'sec-emrys-trap', 'Emrys''s True Motive & The Life-Bound Dragon', 'GM-Only Canonical Truth', 'Emrys carries Sidhe Ard blood, started the Moonlight Wars, steals children''s magic via the Priors, and plans to trick the party into slaying the life-bound dragon so he can extract the final Luminary location without dying.', 'gm', 'approved', '/weave?node=sec-emrys-trap', JSON_OBJECT('truthStatus', 'Undiscovered by Party')),
(1, 'Clue', 'clue-kildrid-tremor', 'Rhythmic Scratching in the Deep Stone', 'Discovered Clue · Road to Cinth', 'Kildrid felt a vast, rhythmic scratching beneath the southern mountain—claws scraping runed granite for a hundred years.', 'players', 'approved', '/loom?query=mountain+stone+sense', JSON_OBJECT('status', 'discovered')),
(1, 'Clue', 'clue-chokrah-manifest', 'Signed Chokrah Siphon Manifest', 'Undiscovered GM Evidence', 'Hidden shipping manifest proving Chokrah shipments feed the Priors'' magic-extraction crucible for a dragon-scale ritual.', 'gm', 'approved', '/weave?node=clue-chokrah-manifest', JSON_OBJECT('status', 'undiscovered')),
(1, 'Claim', 'claim-council-reform', 'Public Claim: "The New Council Protects Every Gift"', 'Disputed Political Narrative', 'Emrys claims the reformed Council registers all magic users solely to protect clerics, warlocks, and self-taught casters from persecution.', 'players', 'draft', '/weave?node=claim-council-reform', JSON_OBJECT('believedBy', 'Citizens of Cinth'))
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `summary`=VALUES(`summary`), `visibility`=VALUES(`visibility`), `canon_status`=VALUES(`canon_status`);

-- Seed Map Scenes
INSERT INTO `lw_scenes` (`campaign_id`, `scene_key`, `name`, `region_name`, `mode_support`, `grid_cols`, `grid_rows`, `biome`, `weather_preset`, `lighting_profile`, `visibility`, `revision`, `scene_config_json`) VALUES
(1, 'scene-cinth-gala', 'Cinth Grand Masquerade & Glass Rotunda', 'City of Cinth', '2D + 3D Linked', 36, 28, 'Urban Noble Estate', 'Clear Starlight', 'Chandelier Warm Gold', 'players', 12, JSON_OBJECT('stamps', 48, 'lights', 14, 'elevationChunks', 6, 'waterSplines', 1)),
(1, 'scene-plains-red', 'The Plains of Red & Broken Fey Cairns', 'Northeast Cinth Road', '2D + 3D Linked', 44, 32, 'Crimson Steppe', 'Ash Wind', 'Dusk Emerald Rim', 'players', 8, JSON_OBJECT('stamps', 64, 'lights', 6, 'elevationChunks', 12, 'waterSplines', 2)),
(1, 'scene-vandia-cliff', 'Vandia Cliff House & Well of Life Approach', 'Bay of Forgotten Treasures', '2D + 3D Linked', 32, 24, 'Coastal Cliff', 'Sea Fog', 'Moonlit Beacon', 'players', 15, JSON_OBJECT('stamps', 39, 'lights', 9, 'elevationChunks', 9, 'waterSplines', 3)),
(1, 'scene-mountain-prison', 'Runed Cavern of the Bound Dragon', 'Southern Mountain Roots', '2D + 3D Linked', 48, 36, 'Subterranean Rune Vault', 'Poison Spore Haze', 'Runic Crimson & Emerald', 'gm', 5, JSON_OBJECT('stamps', 52, 'lights', 18, 'elevationChunks', 16, 'waterSplines', 1))
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `visibility`=VALUES(`visibility`), `revision`=VALUES(`revision`);

-- Seed Assets (Shared across Asset Library, Marketplace, Map Studio, Dice Forge)
INSERT INTO `lw_assets` (`id`, `name`, `category`, `creator_name`, `entitlement`, `price_label`, `price_cents`, `preview_url`, `summary`, `system_code`, `tags_json`) VALUES
('ast-wildflower-scatter', 'Icrandor Highland Wildflower & Cairn Scatter', 'scatter-biome', 'LoomWeaver Studio', 'free', 'Free', 0, '/icrandor_world_dashboard.jpg', 'Deterministic seed-based scatter collection of highland heather, mossy boulders, and weathered fey cairns.', 'system-neutral', JSON_ARRAY('scatter', 'terrain', 'free')),
('ast-artificer-brass-pack', 'Cinth Artificer Guild Brass & Capacitor Stamps', '3d-stamp', 'Master Wren (Creator)', 'included', 'Included in Weaver', 0, '/six-engines-showcase.jpg', '34 top-down and 3D GLB steampunk-arcane workbenches, lightning coils, and skyship dock cranes.', 'dnd5e', JSON_ARRAY('3d-glb', 'steampunk', 'cinth')),
('ast-obsidian-gold-dice', 'Obsidian & Antique Gold Runed Polyhedrals', 'dice-skin', 'LoomWeaver Studio', 'purchased', 'Owned', 499, '/dice-physics-engine.jpg', 'Chamfered 3D physics dice set with emerald nat-20 shockwave and deep basalt roll acoustics.', 'system-neutral', JSON_ARRAY('dice', 'physics', 'cosmetic')),
('ast-anelith-spell-fx', 'Anelith Weave & Chokrah Overcharge Shader Pack', 'spell-fx', 'Arcane Foundry (Creator)', 'included', 'Included in Weaver', 0, '/tactical-combat-engine.jpg', 'GPU particle and post-FX trajectories for Luminary Pillar, Anelith Magic Missile, and Slingshot Tooth Crit.', 'dnd5e', JSON_ARRAY('fx', 'shaders', 'combat')),
('ast-shadow-mountain-mod', 'Shadow of the Mountain — Act I & II Adventure Package (.lwp)', 'adventure-module', 'Jason Tromborg', 'purchased', 'Owned ($14.99)', 1499, '/the-weave-graph-engine.jpg', 'Complete relational + Neo4j graph module with 24 linked maps, NPC motives, and zero-leak secret gates.', 'dnd5e', JSON_ARRAY('module', 'neo4j', 'campaign')),
('ast-gwaedhellain-crypts', 'Underworld Dark Elf Portal & Poisoned Root Kit', 'map-pack', 'Deepstone Cartography', 'locked', '$8.99 (85% to Creator)', 899, '/combat-caves.jpg', 'Modular subterranean portal chambers, corrupted root bridges, and bioluminescent fungal cliffs.', 'system-neutral', JSON_ARRAY('premium', 'underworld', 'map-pack'))
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `entitlement`=VALUES(`entitlement`), `price_label`=VALUES(`price_label`);

-- Seed Event-Backed Statistics
INSERT INTO `lw_combat_telemetry` (`campaign_id`, `character_key`, `character_name`, `class_summary`, `total_damage_dealt`, `damage_vs_dragons`, `damage_vs_undead`, `damage_vs_constructs`, `last_hits`, `natural_20_count`, `natural_1_count`, `healing_done`, `clues_discovered`, `radar_offense`, `radar_defense`, `radar_support`, `radar_control`, `radar_lore`, `radar_tactics`) VALUES
(1, 'pc-dal', 'Dal Riata', 'Elf Ranger · Horizon Scout', 418, 112, 194, 112, 9, 7, 2, 34, 14, 86, 72, 64, 78, 88, 94),
(1, 'pc-fivi', 'Fivi', 'Fey Rogue / Warlock · Slingshot Trickster', 389, 145, 160, 84, 12, 11, 5, 18, 11, 88, 62, 58, 84, 76, 81),
(1, 'pc-kildrid', 'Kildrid', 'Dwarven Cleric · Stone Lorekeeper', 264, 68, 142, 54, 4, 5, 1, 312, 16, 64, 91, 95, 79, 96, 85),
(1, 'pc-kycius', 'Kycius', 'Tabaxi Arcane Investigator', 342, 94, 138, 110, 6, 6, 2, 45, 19, 79, 68, 74, 92, 98, 90),
(1, 'pc-munk', 'Munk', 'Half-Orc Vanguard Fighter', 512, 164, 218, 130, 15, 9, 3, 12, 6, 96, 94, 52, 74, 60, 82)
ON DUPLICATE KEY UPDATE `total_damage_dealt`=VALUES(`total_damage_dealt`), `last_hits`=VALUES(`last_hits`);


-- 9. World Atlas Maps (World -> Continent -> Region -> Settlement -> District -> Building -> Site -> Floor -> Room)
CREATE TABLE IF NOT EXISTS `lw_world_maps` (
  `map_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `scope_level` ENUM('World','Continent','Region','Settlement','District','Building','Site','Floor','Room','WildernessArea') NOT NULL DEFAULT 'World',
  `parent_map_id` VARCHAR(64) NULL,
  `parent_location_key` VARCHAR(64) NULL,
  `image_url` VARCHAR(500) NOT NULL,
  `linked_scene_key` VARCHAR(64) NULL,
  `scale_label` VARCHAR(64) NOT NULL DEFAULT '0 — 100 — 200 Miles',
  `compass_orientation` VARCHAR(64) NOT NULL DEFAULT 'Top-Right North',
  `width_units` INT NOT NULL DEFAULT 1000,
  `height_units` INT NOT NULL DEFAULT 600,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  CONSTRAINT `fk_lw_world_maps_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. World Locations & Hierarchy (Extended to Site, Floor, Room, WildernessArea; canonical entity_id reference)
CREATE TABLE IF NOT EXISTS `lw_world_locations` (
  `location_key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `composite_key` VARCHAR(160) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `location_type` VARCHAR(64) NOT NULL,
  `hierarchy_level` ENUM('World','Continent','Region','Settlement','District','Building','Site','Floor','Room','WildernessArea') NOT NULL DEFAULT 'Settlement',
  `area_code` VARCHAR(32) NULL,
  `parent_location_key` VARCHAR(64) NULL,
  `map_id` VARCHAR(64) NULL,
  `child_map_id` VARCHAR(64) NULL,
  `linked_scene_key` VARCHAR(64) NULL,
  `x_percent` DECIMAL(6,2) NOT NULL DEFAULT 50.00,
  `y_percent` DECIMAL(6,2) NOT NULL DEFAULT 50.00,
  `polygon_points_json` JSON NULL,
  `discovery_status` ENUM('visited','known','rumor','undiscovered') NOT NULL DEFAULT 'known',
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `artwork_url` VARCHAR(500) NOT NULL,
  `description` TEXT NOT NULL,
  `historical_background` TEXT NOT NULL,
  `culture_and_traditions` TEXT NOT NULL,
  `local_myths` TEXT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_world_loc_campaign_key` (`campaign_id`, `location_key`),
  KEY `ix_lw_world_loc_entity` (`entity_id`),
  CONSTRAINT `fk_lw_world_locations_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_world_locations_entity` FOREIGN KEY (`entity_id`) REFERENCES `lw_entities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Lore Library Articles (System-Agnostic Extensible Taxonomy; canonical entity_id reference)
CREATE TABLE IF NOT EXISTS `lw_lore_entries` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `composite_key` VARCHAR(160) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
  `category` VARCHAR(64) NOT NULL,
  `excerpt` VARCHAR(500) NOT NULL,
  `content` TEXT NOT NULL,
  `artwork_url` VARCHAR(500) NOT NULL,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `archived` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `ix_lw_lore_entries_entity` (`entity_id`),
  CONSTRAINT `fk_lw_lore_entries_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_lore_entries_entity` FOREIGN KEY (`entity_id`) REFERENCES `lw_entities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. World History Events (Fictional Era Dates vs Real Session Dates; canonical entity_id reference)
CREATE TABLE IF NOT EXISTS `lw_world_history_events` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(160) NOT NULL,
  `era_name` VARCHAR(128) NOT NULL,
  `world_date_label` VARCHAR(128) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 100,
  `session_number` INT NULL,
  `real_session_date_label` VARCHAR(64) NOT NULL DEFAULT '',
  `category` VARCHAR(64) NOT NULL,
  `summary` TEXT NOT NULL,
  `location_key` VARCHAR(64) NULL,
  `map_id` VARCHAR(64) NULL,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  KEY `ix_lw_world_history_entity` (`entity_id`),
  CONSTRAINT `fk_lw_world_history_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_world_history_entity` FOREIGN KEY (`entity_id`) REFERENCES `lw_entities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Campaign Membership & Identity Reconciliation (lw_users <-> lw_auth_users <-> Character Seats)
CREATE TABLE IF NOT EXISTS `lw_campaign_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `auth_email` VARCHAR(255) NOT NULL,
  `member_role` ENUM('gm','player','spectator') NOT NULL DEFAULT 'player',
  `assigned_character_key` VARCHAR(64) NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_campaign_member` (`campaign_id`, `user_id`),
  CONSTRAINT `fk_lw_camp_members_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_camp_members_user` FOREIGN KEY (`user_id`) REFERENCES `lw_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Adventures & Immutable Published Versions (Authoritative Module Identity & Provenance)
CREATE TABLE IF NOT EXISTS `lw_adventures` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `slug` VARCHAR(96) NOT NULL UNIQUE,
  `title` VARCHAR(160) NOT NULL,
  `subtitle` VARCHAR(255) NOT NULL DEFAULT '',
  `system_code` ENUM('dnd5e','pf2e','vampire_v5','system-neutral') NOT NULL DEFAULT 'dnd5e',
  `adventure_format` ENUM('one-shot','weekend','campaign-act','full-campaign') NOT NULL DEFAULT 'campaign-act',
  `expected_duration_minutes` INT NOT NULL DEFAULT 240,
  `recommended_level_range` VARCHAR(64) NOT NULL DEFAULT 'Levels 5–8',
  `author_user_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
  `author_handle` VARCHAR(96) NOT NULL DEFAULT '@GeoJason',
  `premise` TEXT NOT NULL,
  `background_truth` TEXT NOT NULL,
  `hero_artwork_url` VARCHAR(500) NOT NULL DEFAULT '/combat-caves.jpg',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_adventure_versions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `adventure_id` VARCHAR(64) NOT NULL,
  `version_tag` VARCHAR(32) NOT NULL DEFAULT '1.0.0',
  `schema_version` VARCHAR(64) NOT NULL DEFAULT 'loomweaver.adventure/1',
  `is_immutable_published` TINYINT(1) NOT NULL DEFAULT 1,
  `changelog_summary` VARCHAR(500) NOT NULL DEFAULT 'Initial playable adventure package release.',
  `manifest_json` JSON NULL,
  `published_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_adv_version` (`adventure_id`, `version_tag`),
  CONSTRAINT `fk_lw_adv_versions_adv` FOREIGN KEY (`adventure_id`) REFERENCES `lw_adventures` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Marketplace Module Installations & Package-ID-to-Campaign-ID Remapping
-- (Structure prepared for portable module installations without cross-campaign leakage)
CREATE TABLE IF NOT EXISTS `lw_module_installations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `adventure_version_id` VARCHAR(64) NOT NULL,
  `installed_by_user_id` BIGINT UNSIGNED NOT NULL,
  `installation_status` ENUM('installed','updating','conflict_review','archived') NOT NULL DEFAULT 'installed',
  `local_revision` INT NOT NULL DEFAULT 1,
  `installed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_campaign_installation` (`campaign_id`, `adventure_version_id`),
  CONSTRAINT `fk_lw_install_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_install_adv_ver` FOREIGN KEY (`adventure_version_id`) REFERENCES `lw_adventure_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_module_id_maps` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `installation_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `package_node_id` VARCHAR(64) NOT NULL,
  `campaign_node_id` VARCHAR(64) NOT NULL,
  `campaign_composite_key` VARCHAR(160) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_install_pkg_node` (`installation_id`, `package_node_id`),
  KEY `ix_lw_id_map_campaign_node` (`campaign_id`, `campaign_node_id`),
  CONSTRAINT `fk_lw_id_map_install` FOREIGN KEY (`installation_id`) REFERENCES `lw_module_installations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Adventure Nodes (Canonical entity_id + package_node_id separation for multi-account installations)
CREATE TABLE IF NOT EXISTS `lw_adventure_nodes` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `package_node_id` VARCHAR(64) NULL,
  `adventure_version_id` VARCHAR(64) NOT NULL,
  `parent_node_id` VARCHAR(64) NULL,
  `node_kind` ENUM('adventure','chapter','location','scene','encounter','npc','character','clue','hazard','treasure','secret','rule','handout','map_region') NOT NULL,
  `location_type` ENUM('none','region','city','district','site','floor','room','wilderness_area') NOT NULL DEFAULT 'none',
  `area_key` VARCHAR(32) NULL,
  `title` VARCHAR(160) NOT NULL,
  `subtitle` VARCHAR(200) NOT NULL DEFAULT '',
  `summary` TEXT NOT NULL,
  `sensory_description` TEXT NULL,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `default_state` ENUM('unresolved','discovered','completed','optional') NOT NULL DEFAULT 'unresolved',
  `route_link` VARCHAR(255) NOT NULL DEFAULT '/campaigns',
  `artwork_url` VARCHAR(500) NOT NULL DEFAULT '/combat-caves.jpg',
  `linked_entity_composite_key` VARCHAR(160) NULL,
  `linked_scene_key` VARCHAR(64) NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `metadata_json` JSON NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `ix_lw_adv_nodes_campaign_kind` (`campaign_id`, `node_kind`),
  KEY `ix_lw_adv_nodes_parent` (`campaign_id`, `parent_node_id`),
  KEY `ix_lw_adv_nodes_entity` (`entity_id`),
  CONSTRAINT `fk_lw_adv_nodes_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_adv_nodes_version` FOREIGN KEY (`adventure_version_id`) REFERENCES `lw_adventure_versions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_adv_nodes_entity` FOREIGN KEY (`entity_id`) REFERENCES `lw_entities` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Ordered Typed Adventure Content Blocks (Read-Aloud, Prose, GM Notes, Skill Checks, Tables, Tactics, Rewards)
CREATE TABLE IF NOT EXISTS `lw_adventure_blocks` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 10,
  `block_kind` ENUM('prose','readAloud','gmNote','table','image','check','reference','tactics','reward','condition') NOT NULL,
  `audience` ENUM('public','players','gm') NOT NULL DEFAULT 'gm',
  `shareable` TINYINT(1) NOT NULL DEFAULT 1,
  `title` VARCHAR(160) NOT NULL DEFAULT '',
  `content` TEXT NOT NULL,
  `payload_json` JSON NULL,
  KEY `ix_lw_adv_blocks_node` (`node_id`, `sort_order`),
  CONSTRAINT `fk_lw_adv_blocks_node` FOREIGN KEY (`node_id`) REFERENCES `lw_adventure_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Typed Adventure Relationships & Why-Included Context Explanations
CREATE TABLE IF NOT EXISTS `lw_adventure_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `from_node_id` VARCHAR(64) NOT NULL,
  `to_node_id` VARCHAR(64) NOT NULL,
  `link_type` ENUM('CONTAINS','OCCURS_AT','PLANS','PLAYED','FEATURES','USES','HAS_CLUE','HAS_HAZARD','HAS_TREASURE','REVEALS','LEADS_TO','DEPICTS','REFERENCES','ASSIGNED_MAP') NOT NULL,
  `why_included_label` VARCHAR(160) NOT NULL DEFAULT 'Linked to this scene',
  `direction_or_exit_label` VARCHAR(96) NULL,
  `condition_expr` VARCHAR(255) NULL,
  `sort_order` INT NOT NULL DEFAULT 10,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  UNIQUE KEY `uk_lw_adv_link` (`campaign_id`, `from_node_id`, `to_node_id`, `link_type`),
  KEY `ix_lw_adv_links_to` (`campaign_id`, `to_node_id`),
  CONSTRAINT `fk_lw_adv_links_from` FOREIGN KEY (`from_node_id`) REFERENCES `lw_adventure_nodes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_adv_links_to` FOREIGN KEY (`to_node_id`) REFERENCES `lw_adventure_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Adventure Dependencies & Compendium Resolution Status
CREATE TABLE IF NOT EXISTS `lw_adventure_dependencies` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `adventure_version_id` VARCHAR(64) NOT NULL,
  `dependency_type` ENUM('compendium-creature','compendium-item','compendium-spell','module','system-ruleset') NOT NULL,
  `source_reference` VARCHAR(128) NOT NULL,
  `display_name` VARCHAR(160) NOT NULL,
  `occurrence_count` INT NOT NULL DEFAULT 1,
  `resolution_status` ENUM('resolved','missing','custom-bound') NOT NULL DEFAULT 'resolved',
  `resolved_composite_key` VARCHAR(160) NULL,
  CONSTRAINT `fk_lw_adv_deps_ver` FOREIGN KEY (`adventure_version_id`) REFERENCES `lw_adventure_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Adventure Assets & Clickable Map-Region Polygons
CREATE TABLE IF NOT EXISTS `lw_adventure_assets` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `adventure_version_id` VARCHAR(64) NOT NULL,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `asset_kind` ENUM('map-image','portrait','handout','battlemap-scene','audio') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `content_hash` VARCHAR(128) NOT NULL DEFAULT 'sha256:loomweaver-curated',
  `width_px` INT NOT NULL DEFAULT 1920,
  `height_px` INT NOT NULL DEFAULT 1080,
  `attribution` VARCHAR(255) NOT NULL DEFAULT 'LoomWeaver Studio & Campaign Creator',
  `distribution_permission` ENUM('included','creator-licensed','private-campaign') NOT NULL DEFAULT 'included',
  `audience` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `linked_scene_key` VARCHAR(64) NULL,
  `map_regions_json` JSON NULL,
  CONSTRAINT `fk_lw_adv_assets_ver` FOREIGN KEY (`adventure_version_id`) REFERENCES `lw_adventure_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 21. Durable Planned Sessions & Reusable Session Content Links
CREATE TABLE IF NOT EXISTS `lw_sessions` (
  `session_id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `adventure_version_id` VARCHAR(64) NOT NULL,
  `session_number` INT NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `chapter_node_id` VARCHAR(64) NULL,
  `primary_location_node_id` VARCHAR(64) NULL,
  `assigned_scene_key` VARCHAR(64) NULL,
  `session_state` ENUM('planned','live','completed') NOT NULL DEFAULT 'live',
  `scheduled_date_label` VARCHAR(128) NOT NULL DEFAULT '',
  `epigraph` VARCHAR(500) NOT NULL DEFAULT '',
  `summary` TEXT NOT NULL,
  `artwork_url` VARCHAR(500) NOT NULL DEFAULT '/combat-caves.jpg',
  `objectives_json` JSON NULL,
  `stopping_points_json` JSON NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_campaign_session_num` (`campaign_id`, `session_number`),
  CONSTRAINT `fk_lw_sessions_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_session_content` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `session_id` VARCHAR(64) NOT NULL,
  `node_id` VARCHAR(64) NOT NULL,
  `content_role` ENUM('scene','location','room','npc','character','encounter','clue','hazard','treasure','handout','battlemap','rule') NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 10,
  `why_included_label` VARCHAR(160) NOT NULL DEFAULT 'Planned for Session',
  `is_optional` TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY `uk_lw_session_content_node` (`session_id`, `node_id`),
  CONSTRAINT `fk_lw_session_content_ses` FOREIGN KEY (`session_id`) REFERENCES `lw_sessions` (`session_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lw_session_content_node` FOREIGN KEY (`node_id`) REFERENCES `lw_adventure_nodes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 22. Durable Play Progress, Session Beats, Play Events, Knowledge Grants & Idempotent Rewards
CREATE TABLE IF NOT EXISTS `lw_adventure_progress` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `session_id` VARCHAR(64) NULL,
  `node_id` VARCHAR(64) NULL,
  `beat_key` VARCHAR(64) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `progress_state` ENUM('unresolved','discovered','completed','optional') NOT NULL DEFAULT 'unresolved',
  `is_done` TINYINT(1) NOT NULL DEFAULT 0,
  `outcome_notes` VARCHAR(500) NOT NULL DEFAULT '',
  `revision` INT NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_campaign_beat` (`campaign_id`, `beat_key`),
  CONSTRAINT `fk_lw_adv_progress_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_play_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `session_id` VARCHAR(64) NULL,
  `node_id` VARCHAR(64) NULL,
  `event_kind` VARCHAR(64) NOT NULL,
  `actor_label` VARCHAR(128) NOT NULL DEFAULT 'GM',
  `summary` VARCHAR(500) NOT NULL,
  `payload_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `ix_lw_play_events_campaign` (`campaign_id`, `created_at`),
  CONSTRAINT `fk_lw_play_events_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_knowledge_grants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `target_node_id` VARCHAR(64) NOT NULL,
  `target_composite_key` VARCHAR(160) NOT NULL,
  `granted_to_scope` ENUM('party','character','user') NOT NULL DEFAULT 'party',
  `granted_to_character_key` VARCHAR(64) NOT NULL DEFAULT 'all-party',
  `granted_by_role` VARCHAR(32) NOT NULL DEFAULT 'gm',
  `reason_label` VARCHAR(255) NOT NULL DEFAULT 'Revealed at the table',
  `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_knowledge_grant` (`campaign_id`, `target_node_id`, `granted_to_scope`, `granted_to_character_key`),
  CONSTRAINT `fk_lw_grants_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_reward_awards` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `session_id` VARCHAR(64) NULL,
  `source_node_id` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL UNIQUE,
  `reward_kind` ENUM('xp','item','currency','boon') NOT NULL DEFAULT 'xp',
  `xp_amount` INT NOT NULL DEFAULT 0,
  `currency_label` VARCHAR(64) NOT NULL DEFAULT '',
  `item_composite_key` VARCHAR(160) NULL,
  `summary` VARCHAR(255) NOT NULL,
  `awarded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lw_rewards_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- SEED: ADVENTURES, VERSIONS, NODES, BLOCKS, LINKS, SESSIONS & PROGRESS
-- =============================================================================

INSERT INTO `lw_campaign_members` (`campaign_id`, `user_id`, `auth_email`, `member_role`, `assigned_character_key`) VALUES
(1, 1, 'jtromborg1@gmail.com', 'gm', NULL),
(1, 2, 'player@loom-weaver.com', 'player', 'pc-dal')
ON DUPLICATE KEY UPDATE `member_role`=VALUES(`member_role`), `assigned_character_key`=VALUES(`assigned_character_key`);

INSERT INTO `lw_adventures` (`id`, `slug`, `title`, `subtitle`, `system_code`, `adventure_format`, `expected_duration_minutes`, `recommended_level_range`, `author_user_id`, `author_handle`, `premise`, `background_truth`, `hero_artwork_url`) VALUES
('adv-shadow-mountain', 'shadow-of-the-mountain', 'Shadow of the Mountain', 'Whispering Woods, The Ruined Chapel, and the Road to Cinth', 'dnd5e', 'full-campaign', 1440, 'Levels 5–9', 1, '@GeoJason',
 'Missing travelers, rhythmic tremors in the deep granite, and a half-buried chapel on the edge of the Whispering Woods draw the party into a web woven by the Council reformer Emrys Driothe.',
 'Emrys carries Sidhe Ard blood and cannot slay the life-bound dragon Vaelkorath beneath the mountain himself. The Order of Priors siphons student magic through Chokrah rituals while Emrys steers the party toward the runic cavern.',
 '/combat-caves.jpg'),
('adv-starstone-vaults', 'echoes-of-the-starstone', 'Echoes of the Starstone', 'Siege of the Spire & The Clockwork Vaults of Absalom', 'pf2e', 'campaign-act', 480, 'Levels 4–7', 1, '@GeoJason',
 'Ancient brass gears beneath the Absalom Grand Bazaar awaken as the High Clockmaster seals the lower Starstone conduit.',
 'The Vault Warden construct is bound directly to the Starstone harmonic spire.',
 '/landing-assets/engines/engine-3-loommaps-atlas.jpg')
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `premise`=VALUES(`premise`);

INSERT INTO `lw_adventure_versions` (`id`, `adventure_id`, `version_tag`, `schema_version`, `is_immutable_published`, `changelog_summary`, `manifest_json`) VALUES
('adv-ver-sotm-1-0', 'adv-shadow-mountain', '1.0.0', 'loomweaver.adventure/1', 1, 'Playable Session & Location Adventure Graph with Keyed Chapel Rooms (C1–C3) and Cinth Act.',
 JSON_OBJECT('schemaVersion', 'loomweaver.adventure/1', 'moduleId', 'shadow-of-the-mountain', 'version', '1.0.0', 'system', 'dnd5e', 'format', 'full-campaign')),
('adv-ver-starstone-1-0', 'adv-starstone-vaults', '1.0.0', 'loomweaver.adventure/1', 1, 'Absalom Clockwork Vaults playable module.',
 JSON_OBJECT('schemaVersion', 'loomweaver.adventure/1', 'moduleId', 'echoes-of-the-starstone', 'version', '1.0.0', 'system', 'pf2e', 'format', 'campaign-act'))
ON DUPLICATE KEY UPDATE `changelog_summary`=VALUES(`changelog_summary`);

INSERT INTO `lw_module_installations` (`id`, `campaign_id`, `adventure_version_id`, `installed_by_user_id`, `installation_status`, `local_revision`) VALUES
(1, 1, 'adv-ver-sotm-1-0', 1, 'installed', 15),
(2, 2, 'adv-ver-starstone-1-0', 1, 'installed', 6)
ON DUPLICATE KEY UPDATE `local_revision`=VALUES(`local_revision`);

-- Seed Adventure Nodes for Campaign 1 (Chapters, Locations, Keyed Rooms C1-C3, Scenes, NPCs, Encounters, Clues, Hazards, Treasures, Rules)
INSERT INTO `lw_adventure_nodes` (`id`, `campaign_id`, `adventure_version_id`, `parent_node_id`, `node_kind`, `location_type`, `area_key`, `title`, `subtitle`, `summary`, `sensory_description`, `visibility`, `default_state`, `route_link`, `artwork_url`, `linked_entity_composite_key`, `linked_scene_key`, `metadata_json`) VALUES
('node-chap-whispering', 1, 'adv-ver-sotm-1-0', NULL, 'chapter', 'region', 'CH4', 'Chapter 4: Shadows in the Stone', 'Whispering Woods & The Ruined Chapel Approach', 'The party follows tracks of missing scouts into the Whispering Woods where an Ekkosian wayside chapel hides pre-Moonlight Wars runes.', 'Cold mist curls around mossy Ekkosian boundary stones; the bedrock hums with a faint, rhythmic scraping from leagues to the south.', 'players', 'discovered', '/campaigns', '/combat-caves.jpg', NULL, 'scene-plains-red', JSON_OBJECT('expectedSessions', 2, 'levelRange', '6–7')),
('node-loc-ruined-chapel', 1, 'adv-ver-sotm-1-0', 'node-chap-whispering', 'location', 'site', 'CHAPEL', 'The Ruined Chapel', 'Crumbling Ekkosian Sanctuary on the Edge of Whispering Woods', 'A half-buried stone chapel whose bell tower collapsed during the Moonlight Wars. Travelers have vanished near its courtyard, and Brother Malric tends a lone lantern inside.', 'Cracked slate roof tiles, damp incense mixed with ozone, and ancient scratch marks echoing up through the altar flagstones.', 'players', 'discovered', '/maps?scene=scene-plains-red', '/combat-caves.jpg', '1:Location:loc-plains-red', 'scene-plains-red', JSON_OBJECT('exits', JSON_ARRAY('C1: Ruined Nave', 'C2: Moonlit Courtyard', 'C3: Sealed Altar Crypt'))),
('node-room-c1-nave', 1, 'adv-ver-sotm-1-0', 'node-loc-ruined-chapel', 'location', 'room', 'C1', 'C1: The Shattered Nave', 'Entry Hall & Brother Malric''s Lantern Post', 'Overturned oak pews flank a cracked mosaic of Ekkos, Mother of the Abandoned. Brother Malric keeps vigil by a brass brazier while hiding ledger pages under his vestments.', 'Rain drips through ribs of blackened timber; warm tallow candle-smoke fights the chill draft rising from the northern flagstones.', 'players', 'completed', '/maps?scene=scene-plains-red', '/combat-caves.jpg', '1:Location:loc-plains-red', 'scene-plains-red', JSON_OBJECT('exits', JSON_ARRAY('South: Whispering Woods Road', 'East: C2 Moonlit Courtyard', 'Down (Hidden): C3 Sealed Altar Crypt'), 'mapPolygon', JSON_ARRAY(JSON_OBJECT('x', 18, 'y', 24), JSON_OBJECT('x', 46, 'y', 24), JSON_OBJECT('x', 46, 'y', 62), JSON_OBJECT('x', 18, 'y', 62)))),
('node-room-c2-courtyard', 1, 'adv-ver-sotm-1-0', 'node-loc-ruined-chapel', 'location', 'room', 'C2', 'C2: Moonlit Cloister Courtyard', 'Overgrown Flagstone Yard & Fallen Bell Tower', 'Shattered gargoyles and waist-high brambles choke the cloister yard. Fresh boot-tracks and dragged satchel marks lead toward the sunken crypt stairs.', 'Silver moonlight cuts through dead yew branches; shadows detach unnatural angles from the broken masonry.', 'players', 'unresolved', '/encounters?focus=enc-cinth-ballroom', '/tactical-combat-engine.jpg', '1:Location:loc-plains-red', 'scene-plains-red', JSON_OBJECT('exits', JSON_ARRAY('West: C1 Shattered Nave', 'North Stairs: C3 Sealed Altar Crypt'), 'mapPolygon', JSON_ARRAY(JSON_OBJECT('x', 48, 'y', 20), JSON_OBJECT('x', 78, 'y', 20), JSON_OBJECT('x', 78, 'y', 58), JSON_OBJECT('x', 48, 'y', 58)))),
('node-room-c3-crypt', 1, 'adv-ver-sotm-1-0', 'node-loc-ruined-chapel', 'location', 'room', 'C3', 'C3: Sealed Altar Crypt', 'Subterranean Resonance Vault Beneath the Chapel', 'Beneath the displaced altar slab descends a spiral of basalt steps into a vaulted ossuary carved with pre-Council containment glyphs that echo the southern mountain prison.', 'Cold blue runelight pulses in time with a distant subterranean heartbeat; the scent of Chokrah residue lingers on a stone lectern.', 'gm', 'unresolved', '/maps?scene=scene-mountain-prison', '/the-weave-graph-engine.jpg', '1:Location:loc-cinth', 'scene-mountain-prison', JSON_OBJECT('exits', JSON_ARRAY('Up: C1 Shattered Nave Altar', 'South Passage: C2 Courtyard Stairs'), 'mapPolygon', JSON_ARRAY(JSON_OBJECT('x', 30, 'y', 64), JSON_OBJECT('x', 72, 'y', 64), JSON_OBJECT('x', 72, 'y', 90), JSON_OBJECT('x', 30, 'y', 90)))),
('node-loc-cinth-gala', 1, 'adv-ver-sotm-1-0', 'node-chap-whispering', 'location', 'city', 'CINTH', 'City of Cinth & Grand Masquerade Rotunda', 'Inland Metropolis near the Plains of Vistagh', 'High nobility, the Artificers Guild brass foundry, and the Lord of Cinth''s glass rotunda where Emrys Driothe greets the party.', 'Polished obsidian pillars, phosphor-bronze chandeliers, and string quartets masking the metallic tang of blood.', 'players', 'discovered', '/maps?scene=scene-cinth-gala', '/six-engines-showcase.jpg', '1:Location:loc-cinth', 'scene-cinth-gala', JSON_OBJECT('exits', JSON_ARRAY('Artificers Quarter', 'Grand Ballroom Balcony', 'Cinth Sky-Dock'))),
('node-scene-chapel-arrival', 1, 'adv-ver-sotm-1-0', 'node-room-c1-nave', 'scene', 'room', 'S15-1', 'Scene 1: Vigil in the Shattered Nave', 'Roleplay & Investigation with Brother Malric', 'The party enters C1 out of the Whispering Woods mist, questions Brother Malric, and notices stone-scraping vibrations beneath the altar.', 'Lantern light flickers across defaced Ekkosian reliefs.', 'players', 'completed', '/campaigns', '/combat-caves.jpg', NULL, 'scene-plains-red', JSON_OBJECT('sceneOrder', 1)),
('node-scene-courtyard-ambush', 1, 'adv-ver-sotm-1-0', 'node-room-c2-courtyard', 'scene', 'room', 'S15-2', 'Scene 2: Ambush in the Moonlit Courtyard', 'Tactical Skirmish Among the Cloister Ruins', 'As the party traces the missing scout tracks across C2, Shadow Stalkers bound to the mountain''s poisoned roots strike from the fallen bell tower.', 'Bramble-choked flagstones provide half-cover; moonlight reveals shadow tendencies.', 'players', 'unresolved', '/arcane-screen', '/tactical-combat-engine.jpg', '1:Encounter:enc-cinth-ballroom', 'scene-plains-red', JSON_OBJECT('sceneOrder', 2)),
('node-scene-crypt-descent', 1, 'adv-ver-sotm-1-0', 'node-room-c3-crypt', 'scene', 'room', 'S15-3', 'Scene 3: What Stirs Beneath the Altar', 'Crypt Puzzle, Chokrah Manifest & Runic Echo', 'Unsealing C3 reveals a Prior siphon ledger and a resonant stone plinth that harmonizes with Kildrid''s stone sense and the party''s Luminaries.', 'Runic frost coats the ossuary arches.', 'gm', 'unresolved', '/weave?node=sec-emrys-trap', '/the-weave-graph-engine.jpg', '1:Secret:sec-emrys-trap', 'scene-mountain-prison', JSON_OBJECT('sceneOrder', 3)),
('node-npc-malric', 1, 'adv-ver-sotm-1-0', 'node-room-c1-nave', 'npc', 'none', 'NPC-1', 'Brother Malric', 'Chapel Keeper · Cautious Ekkosian Friar', 'Tends the ruined sanctuary and claims bandits took the missing scouts, but secretly fears the Order of Priors who visited the crypt three nights ago.', NULL, 'players', 'discovered', '/campaigns?inspect=npc-emrys', '/icrandor_world_dashboard.jpg', '1:NPC:npc-emrys', NULL, JSON_OBJECT('initials', 'BM', 'disposition', 'Cautious', 'dispositionTone', 'gold', 'ringColor', '#d9b77a', 'motive', 'Protect the remaining street-children from Prior inquisitors without exposing his past.', 'dialogue', '"Do not lift the altar stone after dark. What scratches beneath the mountain has long fingers."')),
('node-npc-elowen', 1, 'adv-ver-sotm-1-0', 'node-room-c1-nave', 'npc', 'none', 'NPC-2', 'Sister Elowen', 'Wayward Healer · Guarded Witness', 'Treats a wounded Vale scout near the nave entrance and recognizes the star-etched fletching on the recovered arrow.', NULL, 'players', 'discovered', '/campaigns?inspect=npc-kutler', '/six-engines-showcase.jpg', '1:NPC:npc-kutler', NULL, JSON_OBJECT('initials', 'SE', 'disposition', 'Guarded', 'dispositionTone', 'emerald', 'ringColor', '#49e892', 'motive', 'Keep the wounded Vale scout alive until the party clears the courtyard.', 'dialogue', '"The shadows did not kill the scouts outright—they dragged them toward the crypt stairs."')),
('node-npc-emrys', 1, 'adv-ver-sotm-1-0', 'node-loc-cinth-gala', 'npc', 'none', 'NPC-3', 'Emrys Driothe', 'Reformer of the New Council of Magic', 'Benevolent-seeming statesman in Cinth who secretly orchestrates the Priors and seeks to divert the party into the bound dragon''s mountain prison.', NULL, 'players', 'discovered', '/campaigns?inspect=npc-emrys', '/the-weave-graph-engine.jpg', '1:NPC:npc-emrys', 'scene-cinth-gala', JSON_OBJECT('initials', 'ED', 'disposition', 'Deceptive', 'dispositionTone', 'gold', 'ringColor', '#d9b77a', 'motive', 'Learn the party''s return route to Vandia and steer them into the runed cavern.', 'dialogue', '"The old Council hoarded magic for wizards alone. We open the doors to every gift."')),
('node-enc-shadow-stalker', 1, 'adv-ver-sotm-1-0', 'node-room-c2-courtyard', 'encounter', 'room', 'ENC-15', 'Shadow Stalker Pack in the Courtyard', 'Hard Encounter · 3 Shadow Stalkers & 1 Corrupt Prior Hound', 'Triggered when a character crosses the midpoint of C2 or inspects the crypt stairwell without extinguishing bright light.', NULL, 'players', 'unresolved', '/encounters?focus=enc-cinth-ballroom', '/tactical-combat-engine.jpg', '1:Encounter:enc-cinth-ballroom', 'scene-plains-red', JSON_OBJECT('difficulty', 'Hard', 'xpReward', 1800, 'trigger', 'Crossing courtyard midline or disturbing the fallen bell', 'terrain', 'Collapsed bell tower (+2 AC half cover), bramble patches (difficult terrain)', 'tactics', 'Shadow Stalkers teleport between dim pillars to flank spellcasters; retreat into C3 if reduced below 15 HP.')),
('node-clue-crypt-tracks', 1, 'adv-ver-sotm-1-0', 'node-room-c2-courtyard', 'clue', 'room', 'CLUE-1', 'Scratched Basalt & Dragged Satchel Tracks', 'Discovered Clue · Connects C2 Courtyard to C3 Crypt', 'Boot prints mixed with clawed drag marks lead from the broken cloister wall directly to the mortared seam under the altar.', NULL, 'players', 'discovered', '/loom?query=mountain+stone+sense', '/combat-caves.jpg', '1:Clue:clue-kildrid-tremor', NULL, JSON_OBJECT('checkSkill', 'Survival or Stonecunning', 'dc', 13)),
('node-clue-chokrah-seal', 1, 'adv-ver-sotm-1-0', 'node-room-c3-crypt', 'clue', 'room', 'CLUE-2', 'Signed Chokrah Siphon Manifest & Prior Seal', 'Undiscovered Crypt Evidence · Links Chapel to Cinth Priors', 'Wax-sealed cargo ledger in C3 proving Chokrah shipments from the Lost Isles are titrated to extract innate magic from Prior students.', NULL, 'gm', 'unresolved', '/weave?node=clue-chokrah-manifest', '/the-weave-graph-engine.jpg', '1:Clue:clue-chokrah-manifest', NULL, JSON_OBJECT('checkSkill', 'Investigation or Arcana', 'dc', 15)),
('node-haz-crypt-glyph', 1, 'adv-ver-sotm-1-0', 'node-room-c3-crypt', 'hazard', 'room', 'HAZ-1', 'Anelith Feedback Ward on the Crypt Seal', 'Magical Trap · DC 15 Intelligence (Arcana) / Thieves'' Tools', 'Lifting the C3 altar slab without speaking the Ekkosian cadence or chiseling the lead shunt releases a 15-ft pulse of necrotic-radiant static (3d8 damage, DEX save DC 15 half).', NULL, 'gm', 'unresolved', '/encounters', '/tactical-combat-engine.jpg', NULL, NULL, JSON_OBJECT('detectDc', 14, 'disarmDc', 15, 'damage', '3d8 Necrotic/Radiant')),
('node-trs-star-arrow', 1, 'adv-ver-sotm-1-0', 'node-room-c3-crypt', 'treasure', 'room', 'TRS-1', 'Star-Etched Edhellain Wayfinder Quiver & 450 gp', 'Crypt Reliquary Cache · +1200 Party XP & Lineage Relic', 'A silver-chased quiver bearing the royal crest of Edhellain and a pouch of pre-war gold crowns hidden behind the ossuary lectern.', NULL, 'players', 'unresolved', '/assets?inspect=art-luminary-well', '/dice-physics-engine.jpg', '1:Artifact:art-luminary-well', NULL, JSON_OBJECT('xpAmount', 1200, 'currencyLabel', '450 gp + Star-Etched Quiver', 'idempotencyKey', 'reward-c3-star-arrow')),
('node-rule-shadow-tether', 1, 'adv-ver-sotm-1-0', 'node-chap-whispering', 'rule', 'none', 'RULE-1', 'Adventure-Wide Rule: Poisoned Root & Stone Tremor Resonance', 'Applies across Whispering Woods, Ruined Chapel & Mountain Approach', 'Whenever a spell of 3rd level or higher is cast underground, Kildrid''s stone sense detects the directional bearing of the bound dragon''s runes.', NULL, 'players', 'discovered', '/loom', '/icrandor_world_dashboard.jpg', '1:Clue:clue-kildrid-tremor', NULL, JSON_OBJECT('scope', 'Adventure-wide rule'))
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `summary`=VALUES(`summary`), `default_state`=VALUES(`default_state`);

-- Seed Typed Adventure Content Blocks (Read-Aloud, GM Notes, Checks with Outcomes, Tactics)
INSERT INTO `lw_adventure_blocks` (`id`, `campaign_id`, `node_id`, `sort_order`, `block_kind`, `audience`, `shareable`, `title`, `content`, `payload_json`) VALUES
('blk-c1-readaloud', 1, 'node-room-c1-nave', 10, 'readAloud', 'players', 1, 'Read-Aloud: Entering the Shattered Nave',
 'Old stones remember. Rain needles through the ribs of the collapsed roof, hissing against a single brass brazier before the cracked mosaic of Ekkos. An elderly friar in rain-darkened wool lifts a shuttered lantern toward your cloaks: "If you seek the scouts from the Vale road, lower your steel. The stone beneath this floor has been listening since sundown."',
 JSON_OBJECT('roomKey', 'C1')),
('blk-c1-check-malric', 1, 'node-room-c1-nave', 20, 'check', 'gm', 0, 'Insight or Persuasion: Brother Malric''s Hesitation',
 'DC 14 Wisdom (Insight) or Charisma (Persuasion) while speaking with Brother Malric.',
 JSON_OBJECT('skill', 'Insight / Persuasion', 'dc', 14, 'passOutcome', 'Malric admits that three robed Prior inspectors descended beneath the altar three nights ago carrying crates stamped with the Lost Isles Chokrah mark.', 'failOutcome', 'Malric insists only forest wolves prowl the courtyard, though his eyes dart toward the chipped mortar around the altar plinth.')),
('blk-c2-readaloud', 1, 'node-room-c2-courtyard', 10, 'readAloud', 'players', 1, 'Read-Aloud: The Moonlit Cloister Yard',
 'The fallen bronze bell lies half-sunk in black brambles at the center of the courtyard. Between the leaning arches, the mist does not drift with the wind—it pools around three elongated silhouettes crouched above a torn leather messenger satchel.',
 JSON_OBJECT('roomKey', 'C2')),
('blk-c2-check-tracks', 1, 'node-room-c2-courtyard', 20, 'check', 'gm', 0, 'Survival or Stonecunning: Tracing the Dragged Satchel',
 'DC 13 Wisdom (Survival) or Dwarven Stonecunning along the northern cloister flagstones.',
 JSON_OBJECT('skill', 'Survival / Stonecunning', 'dc', 13, 'passOutcome', 'You spot fresh chisel marks and Chokrah dust leading down the exterior cellar steps into Room C3, plus the ambush positions on the bell tower ledge.', 'failOutcome', 'You follow the tracks to the center of the yard but trigger the Shadow Stalkers'' surprise leap from the bell tower arch.')),
('blk-c3-readaloud', 1, 'node-room-c3-crypt', 10, 'readAloud', 'gm', 1, 'Read-Aloud: Unsealing the Altar Crypt',
 'The basalt steps spiral down into air colder than winter river-water. Blue containment runes—carved by the same hand that bound the southern mountain—throb along a vaulted ossuary. On a stone lectern rests a brass siphon vial still warm to the touch.',
 JSON_OBJECT('roomKey', 'C3')),
('blk-c3-check-ward', 1, 'node-room-c3-crypt', 20, 'check', 'gm', 0, 'Arcana or Thieves'' Tools: Disarming the Anelith Feedback Ward',
 'DC 15 Intelligence (Arcana) or Dexterity (Thieves'' Tools) on the copper-inlaid altar seal.',
 JSON_OBJECT('skill', 'Arcana / Thieves'' Tools', 'dc', 15, 'passOutcome', 'You ground the runic charge harmlessly into the bedrock and recover the Signed Chokrah Siphon Manifest and Star-Etched Quiver intact.', 'failOutcome', 'A silent arc of emerald-crimson static lashes 15 ft across the stairs (3d8 damage) and alerts the remaining courtyard stalkers.'))
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `content`=VALUES(`content`);

-- Seed Typed Adventure Links (Explicit graph edges with why_included_label)
INSERT INTO `lw_adventure_links` (`campaign_id`, `from_node_id`, `to_node_id`, `link_type`, `why_included_label`, `direction_or_exit_label`, `sort_order`, `visibility`) VALUES
(1, 'node-chap-whispering', 'node-loc-ruined-chapel', 'CONTAINS', 'Chapter 4 Primary Site', NULL, 10, 'players'),
(1, 'node-loc-ruined-chapel', 'node-room-c1-nave', 'CONTAINS', 'Keyed Room C1 in Ruined Chapel', 'Main Entrance', 10, 'players'),
(1, 'node-loc-ruined-chapel', 'node-room-c2-courtyard', 'CONTAINS', 'Keyed Room C2 in Ruined Chapel', 'East Cloister Arch', 20, 'players'),
(1, 'node-loc-ruined-chapel', 'node-room-c3-crypt', 'CONTAINS', 'Keyed Room C3 beneath Ruined Chapel', 'Subterranean Altar Stairs', 30, 'gm'),
(1, 'node-room-c1-nave', 'node-room-c2-courtyard', 'LEADS_TO', 'East Archway Exit to C2', 'East -> C2: Moonlit Courtyard', 10, 'players'),
(1, 'node-room-c1-nave', 'node-room-c3-crypt', 'LEADS_TO', 'Hidden Altar Stairs to C3', 'Down -> C3: Sealed Altar Crypt', 20, 'gm'),
(1, 'node-room-c2-courtyard', 'node-room-c3-crypt', 'LEADS_TO', 'Sunken Cellar Steps to C3', 'North -> C3: Sealed Altar Crypt', 10, 'players'),
(1, 'node-scene-chapel-arrival', 'node-room-c1-nave', 'OCCURS_AT', 'Occurs in C1: Shattered Nave', NULL, 10, 'players'),
(1, 'node-scene-courtyard-ambush', 'node-room-c2-courtyard', 'OCCURS_AT', 'Occurs in C2: Moonlit Courtyard', NULL, 20, 'players'),
(1, 'node-scene-crypt-descent', 'node-room-c3-crypt', 'OCCURS_AT', 'Occurs in C3: Sealed Altar Crypt', NULL, 30, 'gm'),
(1, 'node-scene-chapel-arrival', 'node-npc-malric', 'FEATURES', 'Present in C1 · Chapel Keeper', NULL, 10, 'players'),
(1, 'node-scene-chapel-arrival', 'node-npc-elowen', 'FEATURES', 'Present in C1 · Tending Wounded Scout', NULL, 20, 'players'),
(1, 'node-scene-courtyard-ambush', 'node-enc-shadow-stalker', 'USES', 'Active Encounter in C2 Courtyard', NULL, 10, 'players'),
(1, 'node-room-c2-courtyard', 'node-clue-crypt-tracks', 'HAS_CLUE', 'Discovered in C2 Flagstones', NULL, 10, 'players'),
(1, 'node-room-c3-crypt', 'node-clue-chokrah-seal', 'HAS_CLUE', 'Hidden on C3 Ossuary Lectern', NULL, 10, 'gm'),
(1, 'node-room-c3-crypt', 'node-haz-crypt-glyph', 'HAS_HAZARD', 'Wards the C3 Altar Slab', NULL, 20, 'gm'),
(1, 'node-room-c3-crypt', 'node-trs-star-arrow', 'HAS_TREASURE', 'Cached in C3 Reliquary Niche', NULL, 30, 'players')
ON DUPLICATE KEY UPDATE `why_included_label`=VALUES(`why_included_label`);

-- Seed Planned & Live Sessions (`lw_sessions` & `lw_session_content`)
INSERT INTO `lw_sessions` (`session_id`, `campaign_id`, `adventure_version_id`, `session_number`, `title`, `chapter_node_id`, `primary_location_node_id`, `assigned_scene_key`, `session_state`, `scheduled_date_label`, `epigraph`, `summary`, `artwork_url`, `objectives_json`, `stopping_points_json`, `revision`) VALUES
('session-15', 1, 'adv-ver-sotm-1-0', 15, 'Session 15 — The Ruined Chapel', 'node-chap-whispering', 'node-loc-ruined-chapel', 'scene-plains-red', 'live', 'Saturday, May 17 · 7:00 PM',
 '"Old stones remember. And something stirs beneath them still."',
 'A crumbling chapel stands on the edge of the Whispering Woods. Strange noises and missing travelers have drawn the party here, where an uneasy silence hangs over the ruins.',
 '/combat-caves.jpg',
 JSON_ARRAY('Question Brother Malric in C1 without alerting Prior watchers', 'Survive the Shadow Stalker ambush in C2 Moonlit Courtyard', 'Unseal C3 Altar Crypt and recover the Chokrah siphon evidence'),
 JSON_ARRAY('After the C2 Courtyard skirmish (short rest breakpoint)', 'Upon opening the C3 Crypt reliquary and reading Emrys''s seal (cliffhanger)'),
 4),
('session-14', 1, 'adv-ver-sotm-1-0', 14, 'Session 14 — Brass Gears & Velvet Fangs', 'node-chap-whispering', 'node-loc-cinth-gala', 'scene-cinth-gala', 'completed', 'Saturday, May 10 · Completed',
 '"Behind every polished mask in Cinth, a gear turns or a fang waits."',
 'The party arrived in Cinth, allied with the Artificers Guild, met the self-styled Council reformer Emrys Driothe at the Lord''s masquerade, and repelled the vampire coven.',
 '/six-engines-showcase.jpg',
 JSON_ARRAY('Inspect the Cinth Artificers Guild defenses', 'Converse with Emrys Driothe at the gala', 'Stop the Crimson Covenant ambush'),
 JSON_ARRAY('Departure toward Whispering Woods chapel trail'),
 8),
('session-2-6', 2, 'adv-ver-starstone-1-0', 6, 'Session 6 — The Clockwork Vaults', NULL, NULL, 'scene-cinth-gala', 'planned', 'Sunday, May 18 · 6:00 PM',
 '"Every gear in Absalom turns toward the Starstone."',
 'The party descends beneath the Grand Bazaar into the sealed clockwork vaults.',
 '/landing-assets/engines/engine-3-loommaps-atlas.jpg',
 JSON_ARRAY('Enter the Clockwork Vaults beneath Absalom', 'Bypass the brass pendulum ward', 'Confront the Vault Automaton Warden'),
 JSON_ARRAY('Before the Starstone inner seal'),
 2)
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `summary`=VALUES(`summary`), `assigned_scene_key`=VALUES(`assigned_scene_key`);

INSERT INTO `lw_session_content` (`campaign_id`, `session_id`, `node_id`, `content_role`, `sort_order`, `why_included_label`, `is_optional`) VALUES
(1, 'session-15', 'node-loc-ruined-chapel', 'location', 10, 'Primary Session 15 Site', 0),
(1, 'session-15', 'node-room-c1-nave', 'room', 20, 'Entry Scene · Present in C1', 0),
(1, 'session-15', 'node-room-c2-courtyard', 'room', 30, 'Ambush Area · Present in C2', 0),
(1, 'session-15', 'node-room-c3-crypt', 'room', 40, 'Climax Vault · Present in C3', 0),
(1, 'session-15', 'node-scene-chapel-arrival', 'scene', 50, 'Planned Scene 1 (Completed)', 0),
(1, 'session-15', 'node-scene-courtyard-ambush', 'scene', 60, 'Planned Scene 2 (Active)', 0),
(1, 'session-15', 'node-scene-crypt-descent', 'scene', 70, 'Planned Scene 3 (Crypt Finale)', 0),
(1, 'session-15', 'node-npc-malric', 'npc', 80, 'Present in C1 · Chapel Keeper', 0),
(1, 'session-15', 'node-npc-elowen', 'npc', 90, 'Present in C1 · Wounded Scout Healer', 0),
(1, 'session-15', 'node-npc-emrys', 'npc', 95, 'Linked via Order of Priors Seal in C3', 1),
(1, 'session-15', 'node-enc-shadow-stalker', 'encounter', 100, 'Triggered in C2 Courtyard', 0),
(1, 'session-15', 'node-clue-crypt-tracks', 'clue', 110, 'Discovered in C2 Flagstones', 0),
(1, 'session-15', 'node-clue-chokrah-seal', 'clue', 120, 'Hidden in C3 Ossuary', 0),
(1, 'session-15', 'node-haz-crypt-glyph', 'hazard', 130, 'Wards the C3 Altar Slab', 0),
(1, 'session-15', 'node-trs-star-arrow', 'treasure', 140, 'Reward Cache in C3 Crypt', 0),
(1, 'session-15', 'node-rule-shadow-tether', 'rule', 150, 'Adventure-wide rule', 0)
ON DUPLICATE KEY UPDATE `why_included_label`=VALUES(`why_included_label`);

-- Seed Session Beats & Play Progress (`lw_adventure_progress`)
INSERT INTO `lw_adventure_progress` (`campaign_id`, `session_id`, `node_id`, `beat_key`, `label`, `progress_state`, `is_done`, `outcome_notes`) VALUES
(1, 'session-15', 'node-room-c1-nave', 'beat-1', 'Arrival at the ruined chapel', 'completed', 1, 'Party entered C1 Shattered Nave out of the Whispering Woods mist.'),
(1, 'session-15', 'node-npc-malric', 'beat-2', 'Speaking with Brother Malric', 'completed', 1, 'Questioned Malric by the brazier; sensed his fear of the Priors.'),
(1, 'session-15', 'node-clue-crypt-tracks', 'beat-3', 'Tracks leading to the crypt', 'discovered', 0, 'Boot tracks and dragged satchel marks lead through C2 toward C3.'),
(1, 'session-15', 'node-enc-shadow-stalker', 'beat-4', 'Ambush in the courtyard', 'unresolved', 0, 'Shadow Stalkers wait atop the fallen bell tower in C2.'),
(1, 'session-15', 'node-room-c3-crypt', 'beat-5', 'Discover what stirs beneath the chapel', 'unresolved', 0, 'Unseal the C3 altar slab and inspect the Chokrah siphon lectern.')
ON DUPLICATE KEY UPDATE `label`=VALUES(`label`), `progress_state`=VALUES(`progress_state`), `is_done`=VALUES(`is_done`);

-- =============================================================================
-- 23. Durable Campaign-Wide Relationships (`lw_entity_relationships`) & Claims (`lw_claims`)
-- Separates GM Truth, In-World Testimony/Claims, and Character Knowledge Grants
-- =============================================================================
CREATE TABLE IF NOT EXISTS `lw_claims` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `composite_key` VARCHAR(160) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `statement` TEXT NOT NULL,
  `truth_assessment` ENUM('unverified','confirmed','disputed','disproven') NOT NULL DEFAULT 'unverified',
  `gm_canonical_truth` TEXT NOT NULL,
  `supporting_source_key` VARCHAR(160) NULL,
  `contradicting_source_key` VARCHAR(160) NULL,
  `documented_lore_id` VARCHAR(64) NULL,
  `implicated_entity_key` VARCHAR(160) NULL,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `revision` INT NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lw_claims_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lw_entity_relationships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `from_entity_id` BIGINT UNSIGNED NULL,
  `from_composite_key` VARCHAR(160) NOT NULL,
  `relationship_type` VARCHAR(64) NOT NULL,
  `to_entity_id` BIGINT UNSIGNED NULL,
  `to_composite_key` VARCHAR(160) NOT NULL,
  `why_included_label` VARCHAR(200) NOT NULL DEFAULT '',
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `source_record_id` VARCHAR(160) NULL,
  `valid_from_event_id` BIGINT UNSIGNED NULL,
  `valid_until_event_id` BIGINT UNSIGNED NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_lw_entity_rel` (`campaign_id`, `from_composite_key`, `relationship_type`, `to_composite_key`),
  KEY `ix_lw_entity_rel_from` (`campaign_id`, `from_composite_key`),
  KEY `ix_lw_entity_rel_to` (`campaign_id`, `to_composite_key`),
  CONSTRAINT `fk_lw_entity_rel_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Canonical Entities for the Complete Connected Story Chain
INSERT INTO `lw_entities` (`campaign_id`, `entity_type`, `entity_key`, `name`, `subtitle`, `summary`, `visibility`, `canon_status`, `route_link`, `metadata_json`) VALUES
(1, 'Session', 'session-15', 'Session 15 — The Ruined Chapel', 'Live Session · Act II: The Road to Cinth', 'The party investigates the Ruined Chapel on the edge of the Whispering Woods across keyed rooms C1, C2, and C3.', 'players', 'approved', '/campaigns?session=session-15', JSON_OBJECT('sessionNumber', 15, 'state', 'live')),
(1, 'Scene', 'scene-crypt-descent', 'Investigate the Crypt', 'Scene 3 · Sealed Altar Crypt (Room C3)', 'Unsealing the displaced Ekkosian altar slab to investigate the subterranean resonance vault and the Chokrah siphon lectern.', 'players', 'approved', '/campaigns?scene=scene-crypt-descent', JSON_OBJECT('roomKey', 'C3', 'planned', true, 'played', false)),
(1, 'Room', 'room-c3-crypt', 'Crypt C3: Sealed Altar Crypt', 'Keyed Room C3 · Beneath the Ruined Chapel', 'Vaulted basalt ossuary beneath the Ruined Chapel etched with pre-Council containment glyphs and a stone lectern bearing Chokrah residue.', 'players', 'approved', '/maps?scene=scene-mountain-prison', JSON_OBJECT('areaKey', 'C3', 'parentLocation', 'loc-ruined-chapel')),
(1, 'Clue', 'clue-carvings-chapel', 'Carvings Beneath the Chapel', 'Discovered Clue · Strange Runes Matching the Mountain Tomb', 'Strange symbols carved beneath the chapel match those from the southern mountain tomb and speak of a life-bound dragon.', 'players', 'approved', '/world-lore?tab=lore&loreId=lore-priors-rituals', JSON_OBJECT('status', 'discovered')),
(1, 'Claim', 'claim-priors-rituals', 'Claim about the Priors: Chokrah Siphon Crucible', 'Confirmed by Manifest · Unverified by Public Citizens', 'The Order of Priors uses titrated Chokrah shipments from the Lost Isles to siphon innate magic from street-born initiates for a dragon-scale ritual.', 'players', 'approved', '/world-lore?tab=lore&loreId=lore-priors-rituals', JSON_OBJECT('truthAssessment', 'confirmed', 'gmTruth', 'Confirmed: Emrys pools the stolen magic for the Luminary god-trap ritual.')),
(1, 'SourceRecord', 'src-malric-testimony', 'Brother Malric''s Lantern Testimony', 'In-World Witness Testimony · Room C1', 'Brother Malric initially claimed forest bandits took the scouts, but under Insight admitted Prior inquisitors descended into Crypt C3 with Chokrah crates.', 'players', 'approved', '/campaigns?inspect=npc-malric', JSON_OBJECT('reliability', 'guarded-witness')),
(1, 'Lore', 'lore-priors-rituals', 'Lore: The Priors'' Rituals & Chokrah Titration', 'Codex Entry · Factions & Forbidden Rites', 'Chronicles how Emrys distorted Ekkos''s street-schools into the Order of Priors, pooling siphoned student magic through Chokrah rituals.', 'players', 'approved', '/world-lore?tab=lore&loreId=lore-priors-rituals', JSON_OBJECT('category', 'Factions')),
(1, 'Lore', 'lore-star-etched-arrow', 'The Star-Etched Arrow', 'Codex Entry · Artifacts & Edhellain Lineage', 'Found on a fallen Vale scout near the chapel courtyard; its star-etched silver fletching bears the royal mark of Edhellain.', 'players', 'approved', '/world-lore?tab=lore&loreId=lore-star-etched-arrow', JSON_OBJECT('category', 'Artifacts'))
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `summary`=VALUES(`summary`), `visibility`=VALUES(`visibility`);

-- Seed Lore Articles in `lw_lore_entries` linked to `lw_entities`
INSERT INTO `lw_lore_entries` (`id`, `campaign_id`, `composite_key`, `title`, `subtitle`, `category`, `excerpt`, `content`, `artwork_url`, `visibility`, `archived`) VALUES
('lore-priors-rituals', 1, '1:Lore:lore-priors-rituals', 'Lore: Priors'' Rituals & The Chokrah Siphon', 'Order of Priors · Corrupted Sanctuaries of Ekkos', 'Factions',
 'Publicly the Priors rescue street children and teach discipline; secretly they siphon innate magic from initiates through Chokrah titration.',
 'Before the Sidhe Ard departed Icrandor, Ekkos left traces of her memory as Mother of the Abandoned. Centuries later, Emrys Driothe reshaped her street-schools into the Order of Priors. While publicly teaching discipline and basic magic to orphans, Prior alchemists use refined Chokrah from the Lost Isles to siphon a percentage of students'' innate gift—telling those children their spark simply ran out—so Emrys can pool the immense arcane reservoir required for a dragon-scale Luminary ritual.',
 '/the-weave-graph-engine.jpg', 'players', 0),
('lore-star-etched-arrow', 1, '1:Lore:lore-star-etched-arrow', 'The Star-Etched Arrow of the Vale', 'Recovered Scout Relic · Edhellain Royal Mark', 'Artifacts',
 'Found on a fallen scout in the Whispering Woods. The silver fletching bears the ancient royal mark of the Vale of Edhellain.',
 'Recovered near the shattered cloister arch of the Ruined Chapel, this star-etched arrow was loosed by a ranger of the Vale before the shadows dragged his satchel toward Crypt C3. Its silver-chased shaft carries the same royal house sigil that appears in the missing lineage pages of Edhellain.',
 '/dice-physics-engine.jpg', 'players', 0)
ON DUPLICATE KEY UPDATE `title`=VALUES(`title`), `excerpt`=VALUES(`excerpt`), `content`=VALUES(`content`);

-- Seed Truth vs. Testimony Claims in `lw_claims`
INSERT INTO `lw_claims` (`id`, `campaign_id`, `composite_key`, `title`, `statement`, `truth_assessment`, `gm_canonical_truth`, `supporting_source_key`, `contradicting_source_key`, `documented_lore_id`, `implicated_entity_key`, `visibility`, `revision`) VALUES
('claim-priors-rituals', 1, '1:Claim:claim-priors-rituals', 'Claim about the Priors',
 'The Order of Priors conducts secret Chokrah rituals beneath Ekkosian chapels to siphon innate magic from street-born initiates.',
 'confirmed',
 'GM Canonical Truth: Confirmed. Emrys created the Priors from his mother Ekkos''s religion and pools the siphoned student magic to power the dragon-scale Luminary ritual.',
 '1:Clue:clue-chokrah-manifest',
 '1:Claim:claim-council-reform',
 'lore-priors-rituals',
 '1:NPC:npc-emrys',
 'players', 3),
('claim-council-reform', 1, '1:Claim:claim-council-reform', 'Public Claim: "The New Council Protects Every Gift"',
 'Emrys Driothe claims the reformed Council of Magic registers self-taught casters solely to protect clerics, warlocks, and artificers from persecution.',
 'disputed',
 'GM Canonical Truth: Partially true in public law, which makes it more dangerous—Emrys uses the registry to track bloodlines and harvest magic.',
 '1:SourceRecord:src-malric-testimony',
 '1:Clue:clue-chokrah-manifest',
 'lore-priors-rituals',
 '1:NPC:npc-emrys',
 'players', 2)
ON DUPLICATE KEY UPDATE `truth_assessment`=VALUES(`truth_assessment`), `gm_canonical_truth`=VALUES(`gm_canonical_truth`);

-- Seed Play Events & Character Knowledge Grants for the Chapel Investigation Chain
INSERT INTO `lw_play_events` (`id`, `campaign_id`, `session_id`, `node_id`, `event_kind`, `actor_label`, `summary`, `payload_json`) VALUES
(1, 1, 'session-14', 'node-room-c3-crypt', 'prior_inspection', 'Order of Priors', 'Three Prior inspectors visited Crypt C3 with Chokrah crates while Brother Malric watched in fear.', JSON_OBJECT('locationKey', 'room-c3-crypt')),
(2, 1, 'session-15', 'node-room-c1-nave', 'npc_relocated', 'Brother Malric', 'Brother Malric retreated from Crypt C3 to keep lantern vigil in C1 Shattered Nave.', JSON_OBJECT('from', 'room-c3-crypt', 'to', 'room-c1-nave')),
(3, 1, 'session-15', 'node-clue-crypt-tracks', 'clue_discovered', 'Dal & Kildrid', 'Discovery during play: Dal and Kildrid discovered the Carvings Beneath the Chapel and dragged satchel tracks leading into Crypt C3.', JSON_OBJECT('characters', JSON_ARRAY('pc-dal', 'pc-kildrid', 'pc-kycius')))
ON DUPLICATE KEY UPDATE `summary`=VALUES(`summary`);

INSERT INTO `lw_knowledge_grants` (`campaign_id`, `target_node_id`, `target_composite_key`, `granted_to_scope`, `granted_to_character_key`, `granted_by_role`, `reason_label`) VALUES
(1, 'node-clue-crypt-tracks', '1:Clue:clue-carvings-chapel', 'character', 'pc-dal', 'gm', 'Discovered the Vale scout arrow and chapel rune carvings during Session 15'),
(1, 'node-clue-crypt-tracks', '1:Clue:clue-kildrid-tremor', 'character', 'pc-kildrid', 'gm', 'Felt the stone-sense resonance matching the southern mountain runes'),
(1, 'node-clue-chokrah-seal', '1:Clue:clue-chokrah-manifest', 'character', 'pc-kycius', 'gm', 'Deciphered the wax-sealed Chokrah manifest on the C3 lectern'),
(1, 'claim-priors-rituals', '1:Claim:claim-priors-rituals', 'party', 'all-party', 'gm', 'Supported by Chokrah manifest & Brother Malric testimony in Session 15')
ON DUPLICATE KEY UPDATE `reason_label`=VALUES(`reason_label`);

-- Seed Durable Campaign Relationships (`lw_entity_relationships`)
-- Complete Chain: Session 15 -> Scene -> Crypt C3 -> Chokrah Manifest -> Claim about the Priors -> Lore: Priors' Rituals & NPC: Emrys + Character Discoveries
INSERT INTO `lw_entity_relationships` (`campaign_id`, `from_composite_key`, `relationship_type`, `to_composite_key`, `why_included_label`, `visibility`, `source_record_id`, `valid_from_event_id`, `valid_until_event_id`, `revision`) VALUES
(1, '1:Session:session-15', 'PLANS', '1:Scene:scene-crypt-descent', 'What are we preparing to play? Session 15 plans Investigate the Crypt', 'players', NULL, 2, NULL, 1),
(1, '1:Scene:scene-crypt-descent', 'OCCURS_AT', '1:Room:room-c3-crypt', 'Where does it happen? Scene occurs at Crypt C3', 'players', NULL, 2, NULL, 1),
(1, '1:Room:room-c3-crypt', 'CONTAINS', '1:Clue:clue-chokrah-manifest', 'What can the party find here? Crypt C3 contains the Chokrah manifest', 'players', NULL, 1, NULL, 1),
(1, '1:Room:room-c3-crypt', 'CONTAINS', '1:Clue:clue-carvings-chapel', 'What can the party find here? Runic carvings beneath the chapel altar', 'players', NULL, 1, NULL, 1),
(1, '1:Clue:clue-chokrah-manifest', 'SUPPORTS', '1:Claim:claim-priors-rituals', 'What does the evidence suggest? Chokrah manifest supports Claim about the Priors', 'players', '1:SourceRecord:src-malric-testimony', 3, NULL, 2),
(1, '1:SourceRecord:src-malric-testimony', 'SUPPORTS', '1:Claim:claim-priors-rituals', 'Witness testimony confirming Prior inspectors brought Chokrah crates to C3', 'players', '1:SourceRecord:src-malric-testimony', 2, NULL, 1),
(1, '1:Claim:claim-council-reform', 'CONTRADICTS', '1:Claim:claim-priors-rituals', 'Public Council reform narrative contradicts the secret Prior siphon claim', 'players', NULL, 1, NULL, 1),
(1, '1:Claim:claim-priors-rituals', 'DOCUMENTED_IN', '1:Lore:lore-priors-rituals', 'Where is the supporting explanation? Documented in Lore: Priors'' rituals', 'players', NULL, 1, NULL, 1),
(1, '1:Claim:claim-priors-rituals', 'IMPLICATES', '1:NPC:npc-emrys', 'Who is involved? Claim implicates Council reformer Emrys Driothe', 'players', NULL, 1, NULL, 1),
(1, '1:Claim:claim-priors-rituals', 'IMPLICATES', '1:Faction:fac-priors', 'Who is involved? Implicates The Order of Priors', 'players', NULL, 1, NULL, 1),
(1, '1:PlayerCharacter:pc-dal', 'DISCOVERED', '1:Clue:clue-carvings-chapel', 'Who actually knows this? Dal discovered the chapel carvings & Vale arrow', 'players', NULL, 3, NULL, 1),
(1, '1:PlayerCharacter:pc-kildrid', 'DISCOVERED', '1:Clue:clue-kildrid-tremor', 'Who actually knows this? Kildrid sensed the runic scraping beneath the stone', 'players', NULL, 3, NULL, 1),
(1, '1:PlayerCharacter:pc-kycius', 'DISCOVERED', '1:Clue:clue-chokrah-manifest', 'Who actually knows this? Kycius inspected the Chokrah manifest seal', 'players', NULL, 3, NULL, 1),
(1, '1:NPC:npc-malric', 'WAS_IN', '1:Room:room-c3-crypt', 'Historical state: Malric was in Crypt C3 when the Priors arrived (Event 1)', 'players', NULL, 1, 2, 1),
(1, '1:NPC:npc-malric', 'CURRENTLY_IN', '1:Location:room-c1-nave', 'Current state: Malric is currently keeping vigil in C1 Shattered Nave (Event 2+)', 'players', NULL, 2, NULL, 2),
(1, '1:Location:loc-cinth', 'LOCATED_IN_REGION', '1:Region:reg-cinth-kingdom', 'Central Kingdoms & Cinth contains City of Cinth', 'players', NULL, 1, NULL, 1),
(1, '1:Location:loc-vandia', 'LOCATED_IN_REGION', '1:Region:reg-southern-kingdoms', 'Southern Kingdoms contains Vandia & Cliff House', 'players', NULL, 1, NULL, 1),
(1, '1:Region:reg-cinth-kingdom', 'DOCUMENTED_IN', '1:Lore:lore-kingdom-cinth', 'Regional lore for Central Kingdoms & Cinth', 'players', NULL, 1, NULL, 1),
(1, '1:Region:reg-southern-kingdoms', 'DOCUMENTED_IN', '1:Lore:lore-vandia-coast', 'Regional lore for Southern Kingdoms & Coastal Marches', 'players', NULL, 1, NULL, 1)
ON DUPLICATE KEY UPDATE `why_included_label`=VALUES(`why_included_label`), `visibility`=VALUES(`visibility`), `revision`=VALUES(`revision`);

CREATE TABLE IF NOT EXISTS `lw_world_regions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `campaign_id` BIGINT UNSIGNED NOT NULL,
  `map_id` VARCHAR(64) NOT NULL,
  `composite_key` VARCHAR(160) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `overlay_type` VARCHAR(32) NOT NULL DEFAULT 'region',
  `subtitle` VARCHAR(200) NOT NULL DEFAULT 'Charted Realm',
  `faction_key` VARCHAR(160) NULL,
  `color_hex` VARCHAR(24) NOT NULL DEFAULT '#d9b77a',
  `label_x` DECIMAL(6,2) NOT NULL DEFAULT 50.00,
  `label_y` DECIMAL(6,2) NOT NULL DEFAULT 50.00,
  `svg_path` TEXT NOT NULL,
  `points_json` JSON NOT NULL,
  `description` TEXT NOT NULL,
  `governance_and_realm` TEXT NOT NULL,
  `linked_lore_id` VARCHAR(64) NULL,
  `visibility` ENUM('public','players','gm') NOT NULL DEFAULT 'players',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_lw_world_regions_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `lw_campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `lw_world_regions` (`id`, `campaign_id`, `map_id`, `composite_key`, `name`, `overlay_type`, `subtitle`, `faction_key`, `color_hex`, `label_x`, `label_y`, `svg_path`, `points_json`, `description`, `governance_and_realm`, `linked_lore_id`, `visibility`) VALUES
('reg-cinth-kingdom', 1, 'map-icrandor-world', '1:Region:reg-cinth-kingdom', 'CENTRAL KINGDOMS & CINTH', 'region', 'Heartland Coalition · Seat of Cinth & Plains of Vistagh', '1:Faction:fac-artificers', '#d9b77a', 39.00, 44.00, 'M 290 190 L 495 175 L 520 315 L 310 330 Z', JSON_ARRAY(JSON_OBJECT('x', 29.0, 'y', 33.9), JSON_OBJECT('x', 49.5, 'y', 31.3), JSON_OBJECT('x', 52.0, 'y', 56.3), JSON_OBJECT('x', 31.0, 'y', 58.9)), 'The central realms of Icrandor anchored by the metropolis of Cinth, the Plains of Vistagh, and the trade roads connecting the western holds to the northern forests.', 'Capital: City of Cinth · Governance: Noble Council & Chartered Artificer Guilds · Primary Trade: Brass Condensers, Chokrah Trade, Sky-Freight', 'lore-kingdom-cinth', 'players'),
('reg-southern-kingdoms', 1, 'map-icrandor-world', '1:Region:reg-southern-kingdoms', 'SOUTHERN KINGDOMS', 'region', 'Coastal Marches · Vandia, Bay of Forgotten Treasures & Well of Life', NULL, '#5ccfe6', 27.00, 62.00, 'M 140 280 L 385 310 L 370 465 L 130 445 Z', JSON_ARRAY(JSON_OBJECT('x', 14.0, 'y', 50.0), JSON_OBJECT('x', 38.5, 'y', 55.4), JSON_OBJECT('x', 37.0, 'y', 83.0), JSON_OBJECT('x', 13.0, 'y', 79.5)), 'The maritime kingdoms and cliffside reaches of southwestern Icrandor, stretching from Vandia and the Bay of Forgotten Treasures northeast along the sacred Well of Life triangle.', 'Major Port: Vandia · Landmarks: Party Cliff-Edge House & Well of Life Sanctuary · Economy: Maritime Shipping & Lost Isles Expeditions', 'lore-vandia-coast', 'players'),
('reg-veldra-wood', 1, 'map-icrandor-world', '1:Region:reg-veldra-wood', 'VELDRA WOOD', 'region', 'Ancient Fey-Bordered Canopy of Icrandor', NULL, '#49e892', 58.00, 36.00, 'M 510 140 L 670 150 L 660 290 L 515 275 Z', JSON_ARRAY(JSON_OBJECT('x', 51.0, 'y', 25.0), JSON_OBJECT('x', 67.0, 'y', 26.8), JSON_OBJECT('x', 66.0, 'y', 51.8), JSON_OBJECT('x', 51.5, 'y', 49.1)), 'An ancient forest older than the current kingdoms, home to fey remnants, boundary stones, and the Whispering Woods approach to the Ruined Chapel.', 'Wardens: Outcast Fey & Hermit Orders · Borders: Whispering Woods & Northern Edhellain Marches', 'lore-veldra-wood', 'players'),
('reg-red-marches', 1, 'map-icrandor-world', '1:Region:reg-red-marches', 'THE PLAINS OF RED', 'region', 'Ancient Fey Battlefield & Southern Mountain Corridor', NULL, '#e26d5c', 56.00, 68.00, 'M 450 330 L 665 340 L 640 465 L 430 450 Z', JSON_ARRAY(JSON_OBJECT('x', 45.0, 'y', 58.9), JSON_OBJECT('x', 66.5, 'y', 60.7), JSON_OBJECT('x', 64.0, 'y', 83.0), JSON_OBJECT('x', 43.0, 'y', 80.4)), 'Named for the slaughter of fey by men roughly a thousand years ago. Borders the poisoned roots of the southern mountain where the bound dragon claws at its runic prison.', 'Terrain: Crimson Steppe & Fey Cairns · Hazard: Subterranean Runic Tremors beneath the Southern Peaks', 'lore-plains-of-red', 'players'),
('reg-blackridge', 1, 'map-icrandor-world', '1:Region:reg-blackridge', 'ORDER OF PRIORS DOMAIN', 'territory', 'GM Secret Territory · Council & Prior Siphon Network', '1:Faction:fac-priors', '#e06c75', 76.00, 30.00, 'M 685 110 L 870 125 L 855 255 L 680 240 Z', JSON_ARRAY(JSON_OBJECT('x', 68.5, 'y', 19.6), JSON_OBJECT('x', 87.0, 'y', 22.3), JSON_OBJECT('x', 85.5, 'y', 45.5), JSON_OBJECT('x', 68.0, 'y', 42.9)), 'Secret jurisdictional reach of the Order of Priors and the Council of Magic''s Chokrah titration academies.', 'Patron: Emrys Driothe · Secret Function: Pooling siphoned student magic for the dragon-scale Luminary ritual', 'lore-priors-rituals', 'gm')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `subtitle`=VALUES(`subtitle`), `svg_path`=VALUES(`svg_path`), `points_json`=VALUES(`points_json`), `description`=VALUES(`description`);



