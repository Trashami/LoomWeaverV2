using System.Text.Json.Nodes;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Items;

// All reads and writes go to the configured loomweaver schema; no process-local fallback.
public static class ItemRepository
{
    public static async Task<MySqlConnection> OpenAsync(LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            CREATE TABLE IF NOT EXISTS lw_item_library (
              id VARCHAR(64) PRIMARY KEY, kind VARCHAR(20) NOT NULL,
              owner_id BIGINT NOT NULL, campaign_id INT NOT NULL DEFAULT 0,
              published BOOLEAN NOT NULL DEFAULT FALSE, payload LONGTEXT NOT NULL,
              INDEX ix_item_owner (owner_id, kind), INDEX ix_item_market (published, kind)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """, db);
        try { await cmd.ExecuteNonQueryAsync(ct); return db; }
        catch { await db.DisposeAsync(); throw; }
    }

    public static async Task<List<JsonObject>> ReadAsync(MySqlConnection db, string kind, long owner, bool market, int? campaign, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            SELECT payload FROM lw_item_library WHERE kind=@kind
            AND ((@market=1 AND published=1) OR (@market=0 AND (owner_id=@owner OR published=1)))
            AND (@campaign IS NULL OR campaign_id=@campaign)
            """, db);
        cmd.Parameters.AddWithValue("@kind", kind);
        cmd.Parameters.AddWithValue("@owner", owner);
        cmd.Parameters.AddWithValue("@market", market);
        cmd.Parameters.AddWithValue("@campaign", (object?)campaign ?? DBNull.Value);
        var list = new List<JsonObject>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) list.Add(JsonNode.Parse(reader.GetString(0))!.AsObject());
        return list;
    }

    public static async Task<JsonObject?> FindAsync(MySqlConnection db, string id, long owner, CancellationToken ct, string kind = "item")
    {
        await using var cmd = new MySqlCommand("SELECT payload FROM lw_item_library WHERE id=@id AND kind=@kind AND (owner_id=@owner OR published=1)", db);
        cmd.Parameters.AddWithValue("@kind", kind);
        cmd.Parameters.AddWithValue("@id", id); cmd.Parameters.AddWithValue("@owner", owner);
        return await cmd.ExecuteScalarAsync(ct) is string json ? JsonNode.Parse(json)!.AsObject() : null;
    }

    public static async Task SaveAsync(MySqlConnection db, string kind, long owner, int campaign, JsonObject value, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_item_library(id,kind,owner_id,campaign_id,published,payload)
            VALUES(@id,@kind,@owner,@campaign,@published,@payload)
            ON DUPLICATE KEY UPDATE payload=IF(owner_id=@owner,@payload,payload),
              published=IF(owner_id=@owner,@published,published)
            """, db);
        cmd.Parameters.AddWithValue("@id", Text(value, "id")); cmd.Parameters.AddWithValue("@kind", kind);
        cmd.Parameters.AddWithValue("@owner", owner); cmd.Parameters.AddWithValue("@campaign", campaign);
        cmd.Parameters.AddWithValue("@published", value["publishedToStore"]?.GetValue<bool>() ?? false);
        cmd.Parameters.AddWithValue("@payload", value.ToJsonString());
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public static async Task<(string Role, string Character)?> MemberAsync(MySqlConnection db, int campaign, long user, CancellationToken ct)
    {
        await using var cmd = new MySqlCommand("SELECT member_role, assigned_character_key FROM lw_campaign_members WHERE campaign_id=@c AND user_id=@u", db);
        cmd.Parameters.AddWithValue("@c", campaign); cmd.Parameters.AddWithValue("@u", user);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? (r.GetString(0), r.IsDBNull(1) ? "" : r.GetString(1)) : null;
    }

    public static string Text(JsonObject value, string key) => value[key]?.GetValue<string>()?.Trim() ?? "";
    public static string CharacterKey(string key) => key.Replace("pc-", "char-", StringComparison.OrdinalIgnoreCase);
}
