using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Merchants;

public static class MerchantRollTableService
{
    private static readonly Regex TagRe = new(@"\{@\w+\s+([^|}]*)(?:\|[^}]*)?\}", RegexOptions.Compiled);

    public static async Task<IReadOnlyList<CampaignRollTableDto>> ListCampaignRollTablesAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        const string sql = """
            SELECT id, campaign_id, roll_table_id, table_name, source_book, session_id, session_title,
                   merchant_id, merchant_name, notes, is_pinned, created_at
            FROM lw_campaign_roll_tables
            WHERE campaign_id = @cid
            ORDER BY is_pinned DESC, id DESC;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@cid", campaignId);

        var list = new List<CampaignRollTableDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new CampaignRollTableDto(
                r.GetInt64(r.GetOrdinal("id")),
                r.GetInt32(r.GetOrdinal("campaign_id")),
                r.GetInt64(r.GetOrdinal("roll_table_id")),
                r.GetString(r.GetOrdinal("table_name")),
                r.GetString(r.GetOrdinal("source_book")),
                r.IsDBNull(r.GetOrdinal("session_id")) ? null : r.GetString(r.GetOrdinal("session_id")),
                r.GetString(r.GetOrdinal("session_title")),
                r.IsDBNull(r.GetOrdinal("merchant_id")) ? null : r.GetInt64(r.GetOrdinal("merchant_id")),
                r.GetString(r.GetOrdinal("merchant_name")),
                r.IsDBNull(r.GetOrdinal("notes")) ? null : r.GetString(r.GetOrdinal("notes")),
                r.GetBoolean(r.GetOrdinal("is_pinned")),
                r.GetDateTime(r.GetOrdinal("created_at"))
            ));
        }

        return list;
    }

    public static async Task<long> AttachRollTableAsync(
        LoomWeaverMySqlRepository repo, int campaignId, AttachRollTableRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        // Fetch table name if missing
        var tableName = req.TableName ?? string.Empty;
        var sourceBook = req.SourceBook ?? string.Empty;
        if (string.IsNullOrWhiteSpace(tableName))
        {
            await using var tCmd = new MySqlCommand(
                "SELECT name, source_book FROM dnd_tables WHERE id = @id LIMIT 1", db);
            tCmd.Parameters.AddWithValue("@id", req.RollTableId);
            await using var tr = await tCmd.ExecuteReaderAsync(ct);
            if (await tr.ReadAsync(ct))
            {
                tableName = tr.GetString(0);
                sourceBook = tr.GetString(1);
            }
            await tr.CloseAsync();
        }

        // If attaching to merchant, update the merchant's roll_table_id
        if (req.MerchantId.HasValue && req.MerchantId.Value > 0)
        {
            await using var mUpd = new MySqlCommand("""
                UPDATE lw_merchants SET
                  roll_table_id = @rtid, roll_table_name = @rtname
                WHERE id = @mid AND campaign_id = @cid;
                """, db);
            mUpd.Parameters.AddWithValue("@rtid", req.RollTableId);
            mUpd.Parameters.AddWithValue("@rtname", tableName);
            mUpd.Parameters.AddWithValue("@mid", req.MerchantId.Value);
            mUpd.Parameters.AddWithValue("@cid", campaignId);
            await mUpd.ExecuteNonQueryAsync(ct);
        }

        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_campaign_roll_tables
              (campaign_id, roll_table_id, table_name, source_book, session_id, session_title, merchant_id, merchant_name, notes, is_pinned)
            VALUES
              (@cid, @rtid, @name, @src, @sid, @stitle, @mid, @mname, @notes, 1);
            SELECT LAST_INSERT_ID();
            """, db);

        cmd.Parameters.AddWithValue("@cid", campaignId);
        cmd.Parameters.AddWithValue("@rtid", req.RollTableId);
        cmd.Parameters.AddWithValue("@name", tableName);
        cmd.Parameters.AddWithValue("@src", sourceBook);
        cmd.Parameters.AddWithValue("@sid", string.IsNullOrWhiteSpace(req.SessionId) ? (object)DBNull.Value : req.SessionId);
        cmd.Parameters.AddWithValue("@stitle", req.SessionTitle ?? string.Empty);
        cmd.Parameters.AddWithValue("@mid", req.MerchantId.HasValue ? (object)req.MerchantId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@mname", req.MerchantName ?? string.Empty);
        cmd.Parameters.AddWithValue("@notes", req.Notes ?? string.Empty);

        return Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
    }

    public static async Task<bool> RemoveRollTableAttachmentAsync(
        LoomWeaverMySqlRepository repo, long attachmentId, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        await using var cmd = new MySqlCommand(
            "DELETE FROM lw_campaign_roll_tables WHERE id = @id AND campaign_id = @cid;", db);
        cmd.Parameters.AddWithValue("@id", attachmentId);
        cmd.Parameters.AddWithValue("@cid", campaignId);
        return await cmd.ExecuteNonQueryAsync(ct) > 0;
    }

    public static async Task<int> RestockFromTableAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, RestockFromTableRequest req, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        // Fetch merchant and attached roll_table_id
        await using var mCmd = new MySqlCommand(
            "SELECT roll_table_id, markup_percent FROM lw_merchants WHERE id = @mid AND campaign_id = @cid LIMIT 1;", db);
        mCmd.Parameters.AddWithValue("@mid", merchantId);
        mCmd.Parameters.AddWithValue("@cid", campaignId);

        long? rollTableId = null;
        var markup = 100;
        await using (var mr = await mCmd.ExecuteReaderAsync(ct))
        {
            if (await mr.ReadAsync(ct))
            {
                if (!mr.IsDBNull(0)) rollTableId = mr.GetInt64(0);
                markup = mr.GetInt32(1);
            }
        }

        if (!rollTableId.HasValue || rollTableId.Value <= 0)
        {
            // Default to table 1 if no roll table is attached
            rollTableId = 1;
        }

        if (req.ClearExisting)
        {
            await using var clr = new MySqlCommand(
                "DELETE FROM lw_merchant_inventory WHERE merchant_id = @mid;", db);
            clr.Parameters.AddWithValue("@mid", merchantId);
            await clr.ExecuteNonQueryAsync(ct);
        }

        // Fetch roll table rows_json
        await using var tCmd = new MySqlCommand(
            "SELECT rows_json FROM dnd_tables WHERE id = @id LIMIT 1;", db);
        tCmd.Parameters.AddWithValue("@id", rollTableId.Value);
        var rowsJson = await tCmd.ExecuteScalarAsync(ct) as string;

        var itemsAdded = 0;
        var itemsToAdd = Math.Clamp(req.NumberOfItems, 1, 20);

        if (!string.IsNullOrWhiteSpace(rowsJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(rowsJson);
                var rowElements = doc.RootElement.EnumerateArray().ToList();
                if (rowElements.Count > 0)
                {
                    var rng = new Random();
                    var picked = rowElements.OrderBy(_ => rng.Next()).Take(itemsToAdd).ToList();

                    foreach (var elem in picked)
                    {
                        var rawText = ExtractText(elem);
                        if (string.IsNullOrWhiteSpace(rawText)) continue;

                        var cleanName = StripTags(rawText);
                        var price = Math.Round(rng.Next(25, 450) * (decimal)markup / 100m, 2);
                        var qty = rng.Next(1, 4);

                        await MerchantStore.InsertItemAsync(
                            db, merchantId, $"table-{Guid.NewGuid():N}", cleanName,
                            "Wondrous Item", "uncommon", $"Sourced from roll table inventory roll.",
                            price, price, qty, false, ct);
                        itemsAdded++;
                    }
                }
            }
            catch
            {
                // Fallback to sample 5e gear
            }
        }

        // If itemsAdded is 0, add from dnd_items
        if (itemsAdded == 0)
        {
            await using var sampleCmd = new MySqlCommand("""
                SELECT name, item_type, rarity, description, value_gp
                FROM dnd_items
                WHERE is_canonical = 1 AND value_gp > 0
                ORDER BY RAND() LIMIT @take;
                """, db);
            sampleCmd.Parameters.AddWithValue("@take", itemsToAdd);
            await using var sr = await sampleCmd.ExecuteReaderAsync(ct);
            var rng = new Random();
            while (await sr.ReadAsync(ct))
            {
                var name = sr.GetString(0);
                var type = sr.IsDBNull(1) ? "Adventuring Gear" : sr.GetString(1);
                var rarity = sr.IsDBNull(2) ? "common" : sr.GetString(2);
                var desc = sr.IsDBNull(3) ? string.Empty : sr.GetString(3);
                var baseGp = sr.IsDBNull(4) ? 50m : Convert.ToDecimal(sr.GetValue(4));
                var price = Math.Round(baseGp * (decimal)markup / 100m, 2);
                if (price <= 0) price = 10;

                await MerchantStore.InsertItemAsync(
                    db, merchantId, $"dnd-{Guid.NewGuid():N}", name, type, rarity,
                    StripTags(desc), baseGp, price, rng.Next(1, 5), false, ct);
                itemsAdded++;
            }
        }

        return itemsAdded;
    }

    public static async Task<IReadOnlyList<MerchantTransactionDto>> ListTransactionsAsync(
        LoomWeaverMySqlRepository repo, long merchantId, int campaignId, CancellationToken ct)
    {
        await using var db = await repo.OpenConnectionAsync(ct);
        await MerchantStore.EnsureTablesAsync(db, ct);

        const string sql = """
            SELECT id, merchant_id, campaign_id, character_key, character_name, transaction_type,
                   item_name, quantity, unit_price_gp, total_gp, used_party_funds, created_at
            FROM lw_merchant_transactions
            WHERE merchant_id = @mid AND campaign_id = @cid
            ORDER BY id DESC LIMIT 50;
            """;

        await using var cmd = new MySqlCommand(sql, db);
        cmd.Parameters.AddWithValue("@mid", merchantId);
        cmd.Parameters.AddWithValue("@cid", campaignId);

        var list = new List<MerchantTransactionDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new MerchantTransactionDto(
                r.GetInt64(r.GetOrdinal("id")),
                r.GetInt64(r.GetOrdinal("merchant_id")),
                r.GetInt32(r.GetOrdinal("campaign_id")),
                r.GetString(r.GetOrdinal("character_key")),
                r.GetString(r.GetOrdinal("character_name")),
                r.GetString(r.GetOrdinal("transaction_type")),
                r.GetString(r.GetOrdinal("item_name")),
                r.GetInt32(r.GetOrdinal("quantity")),
                r.GetDecimal(r.GetOrdinal("unit_price_gp")),
                r.GetDecimal(r.GetOrdinal("total_gp")),
                r.GetBoolean(r.GetOrdinal("used_party_funds")),
                r.GetDateTime(r.GetOrdinal("created_at"))
            ));
        }

        return list;
    }

    private static string ExtractText(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.String) return element.GetString() ?? "";
        if (element.ValueKind == JsonValueKind.Array)
        {
            var arr = element.EnumerateArray().ToList();
            if (arr.Count > 1) return ExtractText(arr[1]);
            if (arr.Count > 0) return ExtractText(arr[0]);
        }
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty("entry", out var e) && e.ValueKind == JsonValueKind.String)
                return e.GetString() ?? "";
            if (element.TryGetProperty("row", out var r) && r.ValueKind == JsonValueKind.Array)
                return ExtractText(r);
        }
        return "";
    }

    private static string StripTags(string text) =>
        TagRe.Replace(text, match => match.Groups[1].Value).Trim();
}
