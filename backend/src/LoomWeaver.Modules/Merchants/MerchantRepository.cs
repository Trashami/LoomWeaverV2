using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantRepository
{
    public static async Task<IReadOnlyList<MerchantSummaryDto>> ListMerchantsAsync(
        LoomWeaverMySqlRepository repo, int campaignId, string? characterKey, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        // Fetch campaign current location
        var currentLocation = await GetCampaignCurrentLocationAsync(db, campaignId, ct);

        var sql = """
            SELECT m.id, m.campaign_id, m.store_name, m.merchant_name, m.tagline, m.image_url,
                   m.location_key, m.location_name, m.roll_table_id, m.roll_table_name, m.is_unlocked,
                   COALESCE(inv.item_count, 0) AS item_count,
                   COALESCE(tx.tx_count, 0) AS tx_count
            FROM lw_merchants m
            LEFT JOIN (
              SELECT merchant_id, COUNT(*) AS item_count
              FROM lw_merchant_inventory
              GROUP BY merchant_id
            ) inv ON inv.merchant_id = m.id
            LEFT JOIN (
              SELECT merchant_id, COUNT(*) AS tx_count
              FROM lw_merchant_transactions
              WHERE @ckey IS NOT NULL AND character_key = @ckey
              GROUP BY merchant_id
            ) tx ON tx.merchant_id = m.id
            WHERE m.campaign_id = @cid
            ORDER BY m.id ASC;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@ckey", string.IsNullOrWhiteSpace(characterKey) ? (object)DBNull.Value : characterKey);

        var list = new List<MerchantSummaryDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var locName = r.GetString(r.GetOrdinal("location_name"));
            var isCurrent = IsLocationMatch(locName, currentLocation);
            var txCount = Convert.ToInt32(r.GetValue(r.GetOrdinal("tx_count")));

            list.Add(new MerchantSummaryDto(
                r.GetInt64(r.GetOrdinal("id")),
                r.GetInt32(r.GetOrdinal("campaign_id")),
                r.GetString(r.GetOrdinal("store_name")),
                r.GetString(r.GetOrdinal("merchant_name")),
                r.GetString(r.GetOrdinal("tagline")),
                r.GetString(r.GetOrdinal("image_url")),
                r.IsDBNull(r.GetOrdinal("location_key")) ? null : r.GetString(r.GetOrdinal("location_key")),
                locName,
                r.IsDBNull(r.GetOrdinal("roll_table_id")) ? null : r.GetInt64(r.GetOrdinal("roll_table_id")),
                r.GetString(r.GetOrdinal("roll_table_name")),
                r.GetBoolean(r.GetOrdinal("is_unlocked")),
                isCurrent,
                txCount > 0,
                txCount,
                Convert.ToInt32(r.GetValue(r.GetOrdinal("item_count")))
            ));
        }

        return list;
    }

    public static async Task<MerchantDto?> GetMerchantAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, string? characterKey, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        var currentLocation = await GetCampaignCurrentLocationAsync(db, campaignId, ct);

        const string sql = """
            SELECT id, campaign_id, store_name, merchant_name, tagline, description, greeting,
                   image_url, banner_url, location_key, location_name, npc_key, npc_name,
                   roll_table_id, roll_table_name, buy_rate_percent, markup_percent, is_unlocked,
                   created_at, updated_at
            FROM lw_merchants
            WHERE id = @mid AND campaign_id = @cid
            LIMIT 1;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;

        var locName = r.GetString(r.GetOrdinal("location_name"));
        var isCurrent = IsLocationMatch(locName, currentLocation);

        var dto = new MerchantDto(
            r.GetInt64(r.GetOrdinal("id")),
            r.GetInt32(r.GetOrdinal("campaign_id")),
            r.GetString(r.GetOrdinal("store_name")),
            r.GetString(r.GetOrdinal("merchant_name")),
            r.GetString(r.GetOrdinal("tagline")),
            r.GetString(r.GetOrdinal("description")),
            r.GetString(r.GetOrdinal("greeting")),
            r.GetString(r.GetOrdinal("image_url")),
            r.GetString(r.GetOrdinal("banner_url")),
            r.IsDBNull(r.GetOrdinal("location_key")) ? null : r.GetString(r.GetOrdinal("location_key")),
            locName,
            r.IsDBNull(r.GetOrdinal("npc_key")) ? null : r.GetString(r.GetOrdinal("npc_key")),
            r.GetString(r.GetOrdinal("npc_name")),
            r.IsDBNull(r.GetOrdinal("roll_table_id")) ? null : r.GetInt64(r.GetOrdinal("roll_table_id")),
            r.GetString(r.GetOrdinal("roll_table_name")),
            r.GetInt32(r.GetOrdinal("buy_rate_percent")),
            r.GetInt32(r.GetOrdinal("markup_percent")),
            r.GetBoolean(r.GetOrdinal("is_unlocked")),
            isCurrent,
            0,
            r.GetDateTime(r.GetOrdinal("created_at")),
            r.GetDateTime(r.GetOrdinal("updated_at"))
        );
        await r.CloseAsync();

        if (!string.IsNullOrWhiteSpace(characterKey))
        {
            await using var txCmd = new MySqlCommand(
                "SELECT COUNT(*) FROM lw_merchant_transactions WHERE merchant_id = @mid AND character_key = @ckey", db);
            txCmd.Parameters.AddWithValue("@mid", merchantId);
            txCmd.Parameters.AddWithValue("@ckey", characterKey);
            var txCount = Convert.ToInt32(await txCmd.ExecuteScalarAsync(ct));
            dto = dto with { PastPurchasesCount = txCount };
        }

        return dto;
    }

    public static async Task<IReadOnlyList<MerchantInventoryItemDto>> ListInventoryAsync(
        LoomWeaverMySqlRepository repo, long merchantId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        const string sql = """
            SELECT id, merchant_id, item_key, name, item_type, rarity, description,
                   base_value_gp, price_gp, quantity, is_featured, properties_json
            FROM lw_merchant_inventory
            WHERE merchant_id = @mid
            ORDER BY is_featured DESC, name ASC;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);

        var list = new List<MerchantInventoryItemDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new MerchantInventoryItemDto(
                r.GetInt64(r.GetOrdinal("id")),
                r.GetInt64(r.GetOrdinal("merchant_id")),
                r.GetString(r.GetOrdinal("item_key")),
                r.GetString(r.GetOrdinal("name")),
                r.GetString(r.GetOrdinal("item_type")),
                r.GetString(r.GetOrdinal("rarity")),
                r.GetString(r.GetOrdinal("description")),
                r.GetDecimal(r.GetOrdinal("base_value_gp")),
                r.GetDecimal(r.GetOrdinal("price_gp")),
                r.GetInt32(r.GetOrdinal("quantity")),
                r.GetBoolean(r.GetOrdinal("is_featured")),
                r.IsDBNull(r.GetOrdinal("properties_json")) ? null : r.GetString(r.GetOrdinal("properties_json"))
            ));
        }
        return list;
    }

    public static async Task<WalletDto> GetWalletAsync(
        LoomWeaverMySqlRepository repo, int campaignId, string? characterKey, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        decimal pGp = 100, pSp = 0, pCp = 0;
        decimal ptGp = 500, ptSp = 0, ptCp = 0;

        // Fetch party wallet
        await using var cmdParty = new MySqlCommand(
            "SELECT gold_gp, silver_sp, copper_cp FROM lw_wallets WHERE campaign_id = @cid AND wallet_type = 'party' LIMIT 1", db);
        cmdParty.Parameters.AddWithValue("@cid", campaignId);
        await using var rParty = await cmdParty.ExecuteReaderAsync(ct);
        if (await rParty.ReadAsync(ct))
        {
            ptGp = rParty.GetDecimal(0);
            ptSp = rParty.GetDecimal(1);
            ptCp = rParty.GetDecimal(2);
        }
        await rParty.CloseAsync();

        if (!string.IsNullOrWhiteSpace(characterKey))
        {
            await using var cmdChar = new MySqlCommand(
                "SELECT gold_gp, silver_sp, copper_cp FROM lw_wallets WHERE campaign_id = @cid AND wallet_type = 'character' AND owner_key = @owner LIMIT 1", db);
            cmdChar.Parameters.AddWithValue("@cid", campaignId);
            cmdChar.Parameters.AddWithValue("@owner", characterKey);
            await using var rChar = await cmdChar.ExecuteReaderAsync(ct);
            if (await rChar.ReadAsync(ct))
            {
                pGp = rChar.GetDecimal(0);
                pSp = rChar.GetDecimal(1);
                pCp = rChar.GetDecimal(2);
            }
        }

        return new WalletDto(pGp, pSp, pCp, ptGp, ptSp, ptCp);
    }

    private static async Task<string> GetCampaignCurrentLocationAsync(MySqlConnection db, int campaignId, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand(
            "SELECT current_location_name FROM lw_campaigns WHERE id = @cid LIMIT 1", db);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        var res = await cmd.ExecuteScalarAsync(ct);
        return res?.ToString() ?? "Starting Location";
    }

    private static bool IsLocationMatch(string merchantLocation, string campaignCurrentLocation)
    {
        if (string.IsNullOrWhiteSpace(merchantLocation) || string.IsNullOrWhiteSpace(campaignCurrentLocation))
            return true;
        var m = merchantLocation.Trim().ToLowerInvariant();
        var c = campaignCurrentLocation.Trim().ToLowerInvariant();
        return m == c || m.Contains(c) || c.Contains(m) || c == "starting location";
    }
}
