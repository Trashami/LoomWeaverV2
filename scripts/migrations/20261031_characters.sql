-- Durable, campaign-scoped characters as typed relational records (no document blobs).
-- NOT APPLIED. Review before running.
USE loomweaver;

CREATE TABLE IF NOT EXISTS lw_characters (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id        BIGINT UNSIGNED NOT NULL,
  character_key      VARCHAR(64) NOT NULL,
  owner_user_id      BIGINT UNSIGNED NULL,
  name               VARCHAR(128) NOT NULL,
  ancestry           VARCHAR(128) NOT NULL DEFAULT '',
  class_name         VARCHAR(128) NOT NULL DEFAULT '',
  system_code        VARCHAR(32) NOT NULL DEFAULT 'dnd5e',
  level              SMALLINT NOT NULL DEFAULT 1,
  current_xp         INT NOT NULL DEFAULT 0,
  next_level_xp      INT NOT NULL DEFAULT 300,
  max_hp             INT NOT NULL DEFAULT 1,
  current_hp         INT NOT NULL DEFAULT 1,
  armor_class        INT NOT NULL DEFAULT 10,
  initiative_bonus   INT NOT NULL DEFAULT 0,
  speed_feet         INT NOT NULL DEFAULT 30,
  proficiency_bonus  INT NOT NULL DEFAULT 2,
  revision           INT NOT NULL DEFAULT 1,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lw_characters_key (campaign_id, character_key),
  KEY ix_lw_characters_owner (campaign_id, owner_user_id),
  CONSTRAINT fk_lw_characters_campaign FOREIGN KEY (campaign_id) REFERENCES lw_campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_lw_characters_owner FOREIGN KEY (owner_user_id) REFERENCES lw_users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_character_abilities (
  character_id  BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(8) NOT NULL,
  label         VARCHAR(32) NOT NULL,
  score         SMALLINT NOT NULL,
  PRIMARY KEY (character_id, code),
  CONSTRAINT fk_lw_character_abilities FOREIGN KEY (character_id) REFERENCES lw_characters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_character_equipment (
  character_id   BIGINT UNSIGNED NOT NULL,
  item_id        VARCHAR(64) NOT NULL,
  name           VARCHAR(160) NOT NULL,
  slot           VARCHAR(48) NOT NULL,
  bonus_summary  VARCHAR(255) NOT NULL DEFAULT '',
  ac_bonus       INT NOT NULL DEFAULT 0,
  attack_bonus   INT NOT NULL DEFAULT 0,
  equipped       TINYINT(1) NOT NULL DEFAULT 0,
  sort_order     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, item_id),
  CONSTRAINT fk_lw_character_equipment FOREIGN KEY (character_id) REFERENCES lw_characters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lw_character_features (
  character_id  BIGINT UNSIGNED NOT NULL,
  sort_order    INT NOT NULL,
  feature_text  VARCHAR(255) NOT NULL,
  PRIMARY KEY (character_id, sort_order),
  CONSTRAINT fk_lw_character_features FOREIGN KEY (character_id) REFERENCES lw_characters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Carry over the three existing Echoes of the Starstone heroes (campaign 1) so the live party is not emptied.
INSERT IGNORE INTO lw_characters
  (campaign_id, character_key, name, ancestry, class_name, system_code, level, current_xp, next_level_xp,
   max_hp, current_hp, armor_class, initiative_bonus, speed_feet, proficiency_bonus)
SELECT 1, v.k, v.n, v.a, v.c, 'dnd5e', 7, v.xp, 34000, v.hp, v.hp, v.ac, v.ini, v.spd, 3
FROM (
  SELECT 'char-dal' k, 'Dallas (Dal)' n, 'Edhellain Royal Lineage' a, 'Horizon Ranger / Pattern Scout' c, 34500 xp, 68 hp, 17 ac, 4 ini, 35 spd
  UNION ALL SELECT 'char-fivi', 'Fivi', 'Feywild Outcast', 'Fey Trickster & Slingshot Savant', 34200, 54, 16, 4, 30
  UNION ALL SELECT 'char-kildrid', 'Kildrid', 'Mountain Dwarf', 'Stone & Rune Scholar', 34100, 65, 18, 1, 25
) v
WHERE EXISTS (SELECT 1 FROM lw_campaigns WHERE id = 1);

INSERT IGNORE INTO lw_character_abilities (character_id, code, label, score)
SELECT c.id, a.code, a.label, a.score
FROM lw_characters c
JOIN (
  SELECT 'char-dal' k, 'STR' code, 'Strength' label, 12 score UNION ALL SELECT 'char-dal','DEX','Dexterity',18
  UNION ALL SELECT 'char-dal','CON','Constitution',14 UNION ALL SELECT 'char-dal','INT','Intelligence',14
  UNION ALL SELECT 'char-dal','WIS','Wisdom',16 UNION ALL SELECT 'char-dal','CHA','Charisma',13
  UNION ALL SELECT 'char-fivi','STR','Strength',9 UNION ALL SELECT 'char-fivi','DEX','Dexterity',18
  UNION ALL SELECT 'char-fivi','CON','Constitution',14 UNION ALL SELECT 'char-fivi','INT','Intelligence',13
  UNION ALL SELECT 'char-fivi','WIS','Wisdom',12 UNION ALL SELECT 'char-fivi','CHA','Charisma',17
  UNION ALL SELECT 'char-kildrid','STR','Strength',14 UNION ALL SELECT 'char-kildrid','DEX','Dexterity',12
  UNION ALL SELECT 'char-kildrid','CON','Constitution',16 UNION ALL SELECT 'char-kildrid','INT','Intelligence',18
  UNION ALL SELECT 'char-kildrid','WIS','Wisdom',15 UNION ALL SELECT 'char-kildrid','CHA','Charisma',10
) a ON a.k = c.character_key
WHERE c.campaign_id = 1;

INSERT IGNORE INTO lw_character_equipment (character_id, item_id, name, slot, bonus_summary, ac_bonus, attack_bonus, equipped, sort_order)
SELECT c.id, e.item_id, e.name, e.slot, e.summary, e.ac, e.atk, e.eq, e.ord
FROM lw_characters c
JOIN (
  SELECT 'char-dal' k, 'eq-dal-1' item_id, 'Edhellain Wayfinder Cloak' name, 'Armor' slot, '+2 AC · Silent Step' summary, 2 ac, 0 atk, 1 eq, 0 ord
  UNION ALL SELECT 'char-dal','eq-dal-2','Twin Recurve Longbow','Main Hand','+2 Attack · 150/600ft',0,2,1,1
  UNION ALL SELECT 'char-dal','eq-dal-3','Cinth Buckler','Off Hand','+1 AC when slung',1,0,0,2
  UNION ALL SELECT 'char-fivi','eq-fivi-1','Tooth-Loaded Fey Slingshot','Main Hand','+3 Crit Precision',0,3,1,0
  UNION ALL SELECT 'char-fivi','eq-fivi-2','Dolly (Modified Pocket-Maw)','Companion','+2 AC Ward · Non-Lethal Gullet',2,1,1,1
  UNION ALL SELECT 'char-kildrid','eq-kil-1','Runed Basalt Half-Plate','Armor','+4 AC · Rune Ward',4,0,1,0
  UNION ALL SELECT 'char-kildrid','eq-kil-2','Anelith Resonance Chisel','Focus','+2 Spell Attack / DC',0,2,1,1
) e ON e.k = c.character_key
WHERE c.campaign_id = 1;

INSERT IGNORE INTO lw_character_features (character_id, sort_order, feature_text)
SELECT c.id, f.ord, f.txt
FROM lw_characters c
JOIN (
  SELECT 'char-dal' k, 0 ord, 'Pattern Danger Sense' txt
  UNION ALL SELECT 'char-dal',1,'True Kingship Lineage (Unclaimed)' UNION ALL SELECT 'char-dal',2,'Extra Attack'
  UNION ALL SELECT 'char-fivi',0,'Fey Logic Redirection' UNION ALL SELECT 'char-fivi',1,'Dolly Gullet Containment'
  UNION ALL SELECT 'char-fivi',2,'Skyship Claimant'
  UNION ALL SELECT 'char-kildrid',0,'Deep Stone Tremorsense' UNION ALL SELECT 'char-kildrid',1,'Pre-Moonlight Rune Deciphering'
  UNION ALL SELECT 'char-kildrid',2,'Abjuration Ward'
) f ON f.k = c.character_key
WHERE c.campaign_id = 1;
