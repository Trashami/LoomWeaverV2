using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantStore
{
    private static bool _initialized;
    private static readonly SemaphoreSlim InitLock = new(1, 1);

    public static async Task EnsureTablesAsync(MySqlConnection db, CancellationToken ct)
    {
        if (_initialized) return;
        await InitLock.WaitAsync(ct);
        try
        {
            if (_initialized) return;

            const string ddl = """
                CREATE TABLE IF NOT EXISTS lw_merchants (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  campaign_id BIGINT UNSIGNED NOT NULL,
                  store_name VARCHAR(160) NOT NULL,
                  merchant_name VARCHAR(160) NOT NULL DEFAULT '',
                  tagline VARCHAR(255) NOT NULL DEFAULT '',
                  description TEXT NOT NULL,
                  greeting TEXT NOT NULL,
                  image_url VARCHAR(500) NOT NULL DEFAULT '',
                  banner_url VARCHAR(500) NOT NULL DEFAULT '',
                  location_key VARCHAR(64) NULL,
                  location_name VARCHAR(160) NOT NULL DEFAULT '',
                  npc_key VARCHAR(64) NULL,
                  npc_name VARCHAR(160) NOT NULL DEFAULT '',
                  roll_table_id BIGINT NULL,
                  roll_table_name VARCHAR(160) NOT NULL DEFAULT '',
                  buy_rate_percent INT NOT NULL DEFAULT 50,
                  markup_percent INT NOT NULL DEFAULT 100,
                  is_unlocked TINYINT(1) NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  KEY ix_merchant_campaign (campaign_id),
                  KEY ix_merchant_loc (campaign_id, location_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS lw_merchant_inventory (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  merchant_id BIGINT UNSIGNED NOT NULL,
                  item_key VARCHAR(64) NOT NULL,
                  name VARCHAR(160) NOT NULL,
                  item_type VARCHAR(64) NOT NULL DEFAULT 'Item',
                  rarity VARCHAR(32) NOT NULL DEFAULT 'common',
                  description TEXT NOT NULL,
                  base_value_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  price_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  quantity INT NOT NULL DEFAULT 1,
                  is_featured TINYINT(1) NOT NULL DEFAULT 0,
                  properties_json JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_inventory_merchant (merchant_id),
                  CONSTRAINT fk_merchant_inv FOREIGN KEY (merchant_id) REFERENCES lw_merchants (id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS lw_merchant_transactions (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  merchant_id BIGINT UNSIGNED NOT NULL,
                  campaign_id BIGINT UNSIGNED NOT NULL,
                  character_key VARCHAR(64) NOT NULL,
                  character_name VARCHAR(128) NOT NULL,
                  transaction_type VARCHAR(16) NOT NULL,
                  item_name VARCHAR(160) NOT NULL,
                  quantity INT NOT NULL DEFAULT 1,
                  unit_price_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  total_gp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  used_party_funds TINYINT(1) NOT NULL DEFAULT 0,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_tx_merchant (merchant_id),
                  KEY ix_tx_campaign_char (campaign_id, character_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS lw_campaign_roll_tables (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  campaign_id BIGINT UNSIGNED NOT NULL,
                  roll_table_id BIGINT NOT NULL,
                  table_name VARCHAR(160) NOT NULL DEFAULT '',
                  source_book VARCHAR(64) NOT NULL DEFAULT '',
                  session_id VARCHAR(64) NULL,
                  session_title VARCHAR(160) NOT NULL DEFAULT '',
                  encounter_id VARCHAR(64) NULL,
                  encounter_title VARCHAR(160) NOT NULL DEFAULT '',
                  merchant_id BIGINT UNSIGNED NULL,
                  merchant_name VARCHAR(160) NOT NULL DEFAULT '',
                  notes TEXT NULL,
                  is_pinned TINYINT(1) NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY ix_crt_campaign (campaign_id),
                  KEY ix_crt_session (campaign_id, session_id),
                  KEY ix_crt_encounter (campaign_id, encounter_id),
                  KEY ix_crt_merchant (merchant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS lw_wallets (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  campaign_id BIGINT UNSIGNED NOT NULL,
                  wallet_type VARCHAR(16) NOT NULL,
                  owner_key VARCHAR(64) NOT NULL,
                  gold_gp DECIMAL(10,2) NOT NULL DEFAULT 100.00,
                  silver_sp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  copper_cp DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uq_wallet (campaign_id, wallet_type, owner_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """;

            await using var cmd = new MySqlCommand(ddl, db);
            await cmd.ExecuteNonQueryAsync(ct);

            try
            {
                await using var alterCmd = new MySqlCommand("""
                    ALTER TABLE lw_campaign_roll_tables
                    ADD COLUMN IF NOT EXISTS encounter_id VARCHAR(64) NULL,
                    ADD COLUMN IF NOT EXISTS encounter_title VARCHAR(160) NOT NULL DEFAULT '';
                """, db);
                await alterCmd.ExecuteNonQueryAsync(ct);
            }
            catch { /* columns already exist on newer schema */ }

            await SeedDefaultDataAsync(db, ct);
            _initialized = true;
        }
        finally
        {
            InitLock.Release();
        }
    }

    private static async Task SeedDefaultDataAsync(MySqlConnection db, CancellationToken ct)
    {
        await using var countCmd = new MySqlCommand("SELECT COUNT(*) FROM lw_merchants WHERE campaign_id = 1", db);
        var count = Convert.ToInt64(await countCmd.ExecuteScalarAsync(ct));
        if (count > 0) return;

        // Seed 3 campaign 1 merchants
        var m1Id = await InsertMerchantAsync(db, 1,
            "The Knot & Knife Curiosity Shop", "Old Garek",
            "Vandia's finest blades, climbing ropes, and obscure coastal relics",
            "A salty, fortified shop tucked under the sea cliffs of Vandia.",
            "Mind the blades on the counter. If you have gold or something strange from the coast, we can talk.",
            "/portraits/garek.png", "/campaigns/vandia-bay.jpg",
            "loc-vandia", "Vandia", "npc-garek", "Old Garek", 1, "Magic Item Table A", 55, 100, ct);

        await InsertItemAsync(db, m1Id, "potion-heal", "Potion of Healing", "Potion", "common", "Regains 2d4+2 hit points when consumed.", 50, 50, 8, true, ct);
        await InsertItemAsync(db, m1Id, "cloak-elvenkind", "Cloak of Elvenkind", "Wondrous Item", "uncommon", "Grants advantage on Stealth checks to hide.", 350, 350, 1, true, ct);
        await InsertItemAsync(db, m1Id, "dagger-venom", "Dagger of Venom", "Weapon", "rare", "+1 magic dagger that can coat itself with black venom once per day.", 1000, 1150, 1, false, ct);
        await InsertItemAsync(db, m1Id, "rope-climb", "Rope of Climbing", "Wondrous Item", "uncommon", "60-foot silk rope that snakes upward on command.", 200, 200, 2, false, ct);
        await InsertItemAsync(db, m1Id, "alchemist-fire", "Alchemist's Fire (flask)", "Adventuring Gear", "common", "Sticky, adhesive fluid that ignites on contact with air.", 50, 50, 5, false, ct);

        var m2Id = await InsertMerchantAsync(db, 1,
            "Artificers Guild Foundry & Sundries", "Master Artificer Valen",
            "Clockwork inventions, precision gears, and runic countermeasures",
            "A bustling brass workshop vibrating with gears and steam pistons in inland Cinth.",
            "Mind your fingers around the dynamo. Everything here is tested against Council magic, guaranteed.",
            "/portraits/valen.png", "/campaigns/cinth-gates.jpg",
            "loc-cinth", "Cinth", "npc-valen", "Master Artificer Valen", 2, "Magic Item Table B", 60, 110, ct);

        await InsertItemAsync(db, m2Id, "goggles-night", "Goggles of Night", "Wondrous Item", "uncommon", "Grants 60ft darkvision or extends existing darkvision.", 400, 440, 1, true, ct);
        await InsertItemAsync(db, m2Id, "clockwork-decoy", "Clockwork Runic Decoy", "Adventuring Gear", "uncommon", "Wind-up mechanical decoy that creates deceptive footfalls.", 180, 200, 2, false, ct);
        await InsertItemAsync(db, m2Id, "potion-greater-heal", "Potion of Greater Healing", "Potion", "uncommon", "Regains 4d4+4 hit points.", 150, 165, 4, true, ct);
        await InsertItemAsync(db, m2Id, "smokepowder-horn", "Smokepowder Horn", "Adventuring Gear", "uncommon", "Contains enough smokepowder for 20 shots or a blast.", 120, 130, 3, false, ct);

        var m3Id = await InsertMerchantAsync(db, 1,
            "Wandering Fey Caravan - Pip's Odds & Ends", "Pip the Goblin Trader",
            "Teeth, bells, shiny trinkets, and bargains from beyond the mist",
            "A colorful ramshackle wagon resting on the edge of the Plains of Red.",
            "Pip has things! Little shiny things, big toothy things! No cursed items, only lightly haunted!",
            "/portraits/pip.png", "/campaigns/plains-of-red.jpg",
            "loc-plains-of-red", "The Plains of Red", "npc-pip", "Pip the Goblin Trader", 3, "Trinkets", 50, 90, ct);

        await InsertItemAsync(db, m3Id, "bag-holding", "Bag of Holding", "Wondrous Item", "uncommon", "Spacious interior pouch that holds up to 500 lbs in an extra-dimensional pocket.", 500, 450, 1, true, ct);
        await InsertItemAsync(db, m3Id, "jar-teeth", "Jar of Preserved Dragon Teeth", "Valuables", "rare", "Smooth, ancient teeth humming with dormant elemental heat.", 250, 225, 4, false, ct);
        await InsertItemAsync(db, m3Id, "driftglobe", "Driftglobe", "Wondrous Item", "uncommon", "Glass sphere that sheds light or daylight and floats at your shoulder.", 250, 225, 1, false, ct);
        await InsertItemAsync(db, m3Id, "potion-invis", "Potion of Invisibility", "Potion", "very rare", "Grants invisibility for 1 hour or until you attack.", 800, 720, 1, false, ct);

        // Seed initial wallets
        await SetWalletAsync(db, 1, "party", "party-pool", 850, 40, 0, ct);
        await SetWalletAsync(db, 1, "character", "char-dal", 145, 20, 0, ct);
        await SetWalletAsync(db, 1, "character", "char-fivi", 95, 35, 0, ct);
        await SetWalletAsync(db, 1, "character", "char-kildrid", 210, 15, 0, ct);

        // Seed initial pinned campaign roll tables
        await using var rtCmd = new MySqlCommand("""
            INSERT IGNORE INTO lw_campaign_roll_tables
              (campaign_id, roll_table_id, table_name, source_book, session_title, merchant_id, merchant_name, notes, is_pinned)
            VALUES
              (1, 1, 'Magic Item Table A', 'DMG', 'Session 15 - Knot & Knife Repose', @m1, 'The Knot & Knife Curiosity Shop', 'Common and minor wonders for coastal trade', 1),
              (1, 2, 'Magic Item Table B', 'DMG', 'Session 16 - Infiltrating Cinth', @m2, 'Artificers Guild Foundry & Sundries', 'Artificer clockwork and combat consumables', 1);
            """, db);
        rtCmd.Parameters.AddWithValue("@m1", m1Id);
        rtCmd.Parameters.AddWithValue("@m2", m2Id);
        await rtCmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<long> InsertMerchantAsync(
        MySqlConnection db, int campaignId, string storeName, string merchantName, string tagline,
        string description, string greeting, string imageUrl, string bannerUrl,
        string locationKey, string locationName, string npcKey, string npcName,
        long rollTableId, string rollTableName, int buyRate, int markup, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_merchants
              (campaign_id, store_name, merchant_name, tagline, description, greeting, image_url, banner_url,
               location_key, location_name, npc_key, npc_name, roll_table_id, roll_table_name, buy_rate_percent, markup_percent, is_unlocked)
            VALUES
              (@cid, @sname, @mname, @tag, @desc, @greet, @img, @bnr, @lkey, @lname, @nkey, @nname, @rtid, @rtname, @buy, @markup, 1);
            SELECT LAST_INSERT_ID();
            """, db);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@sname", storeName);
        cmd.Parameters.AddWithValue("@mname", merchantName);
        cmd.Parameters.AddWithValue("@tag", tagline);
        cmd.Parameters.AddWithValue("@desc", description);
        cmd.Parameters.AddWithValue("@greet", greeting);
        cmd.Parameters.AddWithValue("@img", imageUrl);
        cmd.Parameters.AddWithValue("@bnr", bannerUrl);
        cmd.Parameters.AddWithValue("@lkey", locationKey);
        cmd.Parameters.AddWithValue("@lname", locationName);
        cmd.Parameters.AddWithValue("@nkey", npcKey);
        cmd.Parameters.AddWithValue("@nname", npcName);
        cmd.Parameters.AddWithValue("@rtid", rollTableId);
        cmd.Parameters.AddWithValue("@rtname", rollTableName);
        cmd.Parameters.AddWithValue("@buy", buyRate);
        cmd.Parameters.AddWithValue("@markup", markup);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public static async Task<long> InsertItemAsync(
        MySqlConnection db, long merchantId, string itemKey, string name, string itemType,
        string rarity, string description, decimal baseVal, decimal price, int qty, bool isFeatured, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_merchant_inventory
              (merchant_id, item_key, name, item_type, rarity, description, base_value_gp, price_gp, quantity, is_featured)
            VALUES
              (@mid, @ikey, @name, @itype, @rarity, @desc, @bval, @price, @qty, @feat);
            SELECT LAST_INSERT_ID();
            """, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@ikey", itemKey);
        cmd.Parameters.AddWithValue("@name", name);
        cmd.Parameters.AddWithValue("@itype", itemType);
        cmd.Parameters.AddWithValue("@rarity", rarity);
        cmd.Parameters.AddWithValue("@desc", description);
        cmd.Parameters.AddWithValue("@bval", baseVal);
        cmd.Parameters.AddWithValue("@price", price);
        cmd.Parameters.AddWithValue("@qty", qty);
        cmd.Parameters.AddWithValue("@feat", isFeatured ? 1 : 0);
        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public static async Task SetWalletAsync(
        MySqlConnection db, int campaignId, string walletType, string ownerKey,
        decimal gp, decimal sp, decimal cp, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_wallets (campaign_id, wallet_type, owner_key, gold_gp, silver_sp, copper_cp)
            VALUES (@cid, @type, @owner, @gp, @sp, @cp)
            ON DUPLICATE KEY UPDATE gold_gp = @gp, silver_sp = @sp, copper_cp = @cp;
            """, db);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@type", walletType);
        cmd.Parameters.AddWithValue("@owner", ownerKey);
        cmd.Parameters.AddWithValue("@gp", gp);
        cmd.Parameters.AddWithValue("@sp", sp);
        cmd.Parameters.AddWithValue("@cp", cp);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
