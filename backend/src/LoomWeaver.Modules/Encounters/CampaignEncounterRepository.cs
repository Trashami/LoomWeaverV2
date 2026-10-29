using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Encounters;

public static class CampaignEncounterRepository
{
    private static async Task<MySqlConnection> OpenAsync(LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        return await repo.OpenConnectionAsync(ct);
    }

    public static async Task<IReadOnlyList<JsonElement>> ListAsync(LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct)
    {
        await using var db = await OpenAsync(repo, ct);
        await using var cmd = new MySqlCommand("SELECT payload FROM lw_saved_encounters WHERE campaign_id=@c", db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var list = new List<JsonElement>();
        while (await reader.ReadAsync(ct)) list.Add(JsonSerializer.Deserialize<JsonElement>(reader.GetString(0)));
        return list;
    }

    public static async Task SaveAsync(LoomWeaverMySqlRepository repo, int campaignId, string id, JsonElement payload, CancellationToken ct)
    {
        await using var db = await OpenAsync(repo, ct);
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_saved_encounters(campaign_id,encounter_id,payload) VALUES(@c,@id,@p)
            ON DUPLICATE KEY UPDATE payload=@p
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId); cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@p", payload.GetRawText());
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
