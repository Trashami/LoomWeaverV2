using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Sessions;

public static class SessionChronicleEndpoints
{
    public static RouteGroupBuilder MapSessionChronicleEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/sessions", ListSessionsAsync);
        api.MapPost("/campaigns/{campaignId:int}/sessions", CreateSessionAsync);
        api.MapGet("/campaigns/{campaignId:int}/play-events", ListPlayEventsAsync);
        return api;
    }

    private static async Task<IResult> ListSessionsAsync(
        int campaignId, LoomWeaverMySqlRepository mysql, CancellationToken ct)
    {
        var sessions = new List<SessionRecapContract>();
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT s.session_id, s.session_number, s.title, s.scheduled_date_label,
                   s.summary, s.objectives_json, s.primary_location_node_id,
                   COALESCE(SUM(r.xp_amount), 0)
            FROM lw_sessions s
            LEFT JOIN lw_reward_awards r ON r.session_id = s.session_id
            WHERE s.campaign_id = @c
            GROUP BY s.session_id, s.session_number, s.title, s.scheduled_date_label,
                     s.summary, s.objectives_json, s.primary_location_node_id
            ORDER BY s.session_number DESC
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var highlights = reader.IsDBNull(5)
                ? Array.Empty<string>()
                : JsonSerializer.Deserialize<string[]>(reader.GetString(5)) ?? [];
            var location = reader.IsDBNull(6) ? string.Empty : reader.GetString(6);
            var links = string.IsNullOrWhiteSpace(location)
                ? Array.Empty<SessionDeepLinkContract>()
                : [new SessionDeepLinkContract("Session location", "/maps", location)];
            sessions.Add(new SessionRecapContract(
                reader.GetString(0),
                campaignId,
                reader.GetInt32(1),
                reader.GetString(2),
                location,
                reader.IsDBNull(3) ? string.Empty : reader.GetString(3),
                Convert.ToInt32(reader.GetInt64(7)),
                reader.GetString(4),
                highlights,
                links));
        }

        return Results.Ok(sessions);
    }

    private static async Task<IResult> CreateSessionAsync(
        int campaignId,
        CreateSessionRecapRequest req,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsAccountGm) return Results.Forbid();
        if (string.IsNullOrWhiteSpace(req.Title) || req.Title.Trim().Length > 160)
            return Results.BadRequest(new { error = "A session title (1-160 characters) is required." });
        if (req.XpAwarded < 0 || req.XpAwarded > 1_000_000)
            return Results.BadRequest(new { error = "XP must be between 0 and 1,000,000." });
        if (req.Highlights?.Count > 100)
            return Results.BadRequest(new { error = "A session can contain at most 100 highlights." });

        var sessionId = $"session-{Guid.NewGuid():N}";
        var summary = req.Summary?.Trim() ?? string.Empty;
        var highlights = req.Highlights?.Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim()).ToArray() ?? [];
        var title = req.Title.Trim();
        var location = req.LocationName?.Trim() ?? string.Empty;
        var sessionNumber = req.SessionNumber;
        var objectivesJson = JsonSerializer.Serialize(highlights);

        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        if (sessionNumber <= 0)
        {
            await using var number = new MySqlCommand(
                "SELECT COALESCE(MAX(session_number), 0) + 1 FROM lw_sessions WHERE campaign_id = @c", db, tx);
            number.Parameters.AddWithValue("@c", campaignId);
            sessionNumber = Convert.ToInt32(await number.ExecuteScalarAsync(ct));
        }

        await using (var insert = new MySqlCommand("""
            INSERT INTO lw_sessions
                (session_id, campaign_id, adventure_version_id, session_number, title,
                 primary_location_node_id, session_state, epigraph, summary, objectives_json)
            VALUES (@id, @c, 'session-chronicle-v1', @n, @title, NULLIF(@location, ''),
                    'completed', '', @summary, @objectives)
            """, db, tx))
        {
            insert.Parameters.AddWithValue("@id", sessionId);
            insert.Parameters.AddWithValue("@c", campaignId);
            insert.Parameters.AddWithValue("@n", sessionNumber);
            insert.Parameters.AddWithValue("@title", title);
            insert.Parameters.AddWithValue("@location", location);
            insert.Parameters.AddWithValue("@summary", summary);
            insert.Parameters.AddWithValue("@objectives", objectivesJson);
            await insert.ExecuteNonQueryAsync(ct);
        }

        if (req.XpAwarded > 0)
        {
            var key = $"session:{sessionId}:party-xp";
            await using var award = new MySqlCommand("""
                INSERT INTO lw_reward_awards
                    (campaign_id, session_id, source_node_id, idempotency_key, reward_kind, xp_amount, summary)
                VALUES (@c, @s, @source, @key, 'xp', @xp, @summary)
                """, db, tx);
            award.Parameters.AddWithValue("@c", campaignId);
            award.Parameters.AddWithValue("@s", sessionId);
            award.Parameters.AddWithValue("@source", sessionId);
            award.Parameters.AddWithValue("@key", key);
            award.Parameters.AddWithValue("@xp", req.XpAwarded);
            award.Parameters.AddWithValue("@summary", $"Party XP for session {sessionNumber}");
            await award.ExecuteNonQueryAsync(ct);
        }

        var payload = JsonSerializer.Serialize(new { sessionNumber, title, location, xpAwarded = req.XpAwarded, highlights });
        await using (var playEvent = new MySqlCommand("""
            INSERT INTO lw_play_events (campaign_id, session_id, event_kind, actor_label, summary, payload_json)
            VALUES (@c, @s, 'session_completed', @actor, @summary, @payload)
            """, db, tx))
        {
            playEvent.Parameters.AddWithValue("@c", campaignId);
            playEvent.Parameters.AddWithValue("@s", sessionId);
            playEvent.Parameters.AddWithValue("@actor", access.Username);
            playEvent.Parameters.AddWithValue("@summary", string.IsNullOrWhiteSpace(summary) ? title : summary);
            playEvent.Parameters.AddWithValue("@payload", payload);
            await playEvent.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
        return Results.Created($"/api/campaigns/{campaignId}/sessions/{sessionId}", new SessionRecapContract(
            sessionId, campaignId, sessionNumber, title, location, string.Empty, req.XpAwarded,
            summary, highlights, []));
    }

    private static async Task<IResult> ListPlayEventsAsync(
        int campaignId,
        HttpContext context,
        LoomWeaverMySqlRepository mysql,
        CancellationToken ct)
    {
        var access = await CampaignAccessResolver.ResolveAsync(context, campaignId, null, ct);
        if (!access.IsAccountGm) return Results.Forbid();

        var events = new List<object>();
        await using var db = await mysql.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT id, session_id, node_id, event_kind, actor_label, summary, payload_json, created_at
            FROM lw_play_events WHERE campaign_id = @c ORDER BY id DESC LIMIT 500
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            events.Add(new
            {
                id = reader.GetInt64(0),
                sessionId = reader.IsDBNull(1) ? null : reader.GetString(1),
                nodeId = reader.IsDBNull(2) ? null : reader.GetString(2),
                kind = reader.GetString(3),
                actor = reader.GetString(4),
                summary = reader.GetString(5),
                payload = reader.IsDBNull(6) ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(reader.GetString(6)),
                createdAt = reader.GetDateTime(7)
            });
        }

        return Results.Ok(events);
    }
}
