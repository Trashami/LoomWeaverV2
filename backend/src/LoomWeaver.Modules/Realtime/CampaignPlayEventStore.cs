using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Realtime;

public static class CampaignPlayEventStore
{
    public static async Task<TableRealtimeEventContract> AppendAsync(
        LoomWeaverMySqlRepository mysql,
        int campaignId,
        string eventKind,
        string actor,
        string summary,
        string payloadJson,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(eventKind) || eventKind.Length > 64 ||
            string.IsNullOrWhiteSpace(actor) || actor.Length > 128 ||
            string.IsNullOrWhiteSpace(summary) || summary.Length > 500)
            throw new ArgumentException("Play event fields exceed their allowed lengths.");

        using var payload = JsonDocument.Parse(payloadJson);
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_play_events (campaign_id, event_kind, actor_label, summary, payload_json)
            VALUES (@c, @kind, @actor, @summary, CAST(@payload AS JSON))
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@kind", eventKind);
        cmd.Parameters.AddWithValue("@actor", actor);
        cmd.Parameters.AddWithValue("@summary", summary);
        cmd.Parameters.AddWithValue("@payload", payloadJson);
        await cmd.ExecuteNonQueryAsync(ct);

        return new TableRealtimeEventContract(
            $"evt-{cmd.LastInsertedId}",
            campaignId,
            eventKind,
            actor,
            summary,
            payloadJson,
            DateTimeOffset.UtcNow);
    }

    public static async Task<IReadOnlyList<TableRealtimeEventContract>> ListRecentAsync(
        LoomWeaverMySqlRepository mysql,
        int campaignId,
        bool isGm,
        int limit,
        CancellationToken ct)
    {
        var events = new List<TableRealtimeEventContract>();
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT id, event_kind, actor_label, summary, payload_json, created_at
            FROM lw_play_events WHERE campaign_id = @c ORDER BY id DESC LIMIT @limit
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@limit", Math.Clamp(limit, 1, 100));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var payload = reader.IsDBNull(4) ? "{}" : reader.GetString(4);
            var eventKind = reader.GetString(1);
            if (!isGm && TableRealtimeEndpoints.IsGmOnly(eventKind, payload)) continue;
            events.Add(new TableRealtimeEventContract(
                $"evt-{reader.GetInt64(0)}",
                campaignId,
                eventKind,
                reader.GetString(2),
                reader.GetString(3),
                payload,
                DateTime.SpecifyKind(reader.GetDateTime(5), DateTimeKind.Utc)));
        }

        return events;
    }
}
