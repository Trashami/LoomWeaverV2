using System.Collections.Concurrent;
using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using LoomWeaver.Modules.Knowledge;
using LoomWeaver.Modules.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using MySqlConnector;

namespace LoomWeaver.Modules.Encounters;

public sealed record EncounterLootSyncRequest(
    string RecapId,
    int SessionNumber,
    string SessionId,
    string SessionTitle,
    string EncounterId,
    string EncounterTitle,
    int DefeatedBodyCount,
    int TotalGoldGp,
    int RemainingGoldGp,
    string LoomSummaryText,
    JsonElement StateJson);

public sealed record StoredEncounterLootRecord(
    string RecapId,
    int CampaignId,
    int SessionNumber,
    string SessionId,
    string SessionTitle,
    string EncounterId,
    string EncounterTitle,
    int DefeatedBodyCount,
    int TotalGoldGp,
    int RemainingGoldGp,
    string LoomSummaryText,
    JsonElement StateJson,
    DateTimeOffset UpdatedAt);

public static class EncounterLootEndpoints
{
    private static readonly ConcurrentDictionary<int, StoredEncounterLootRecord> ActiveByCampaign = new();
    private static readonly ConcurrentDictionary<int, List<StoredEncounterLootRecord>> HistoryByCampaign = new();

    public static void MapEncounterLootEndpoints(this IEndpointRouteBuilder group)
    {
        group.MapGet("/campaigns/{campaignId:int}/encounters/loot-state", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);

            ActiveByCampaign.TryGetValue(campaignId, out var active);
            var history = GetHistory(campaignId);
            return Results.Ok(new
            {
                campaignId,
                active = active?.StateJson,
                history = history.Select(h => new
                {
                    h.RecapId,
                    h.SessionNumber,
                    h.SessionId,
                    h.SessionTitle,
                    h.EncounterId,
                    h.EncounterTitle,
                    h.DefeatedBodyCount,
                    h.TotalGoldGp,
                    h.RemainingGoldGp,
                    h.LoomSummaryText,
                    h.UpdatedAt
                }).ToArray()
            });
        });

        group.MapPost("/campaigns/{campaignId:int}/encounters/loot-sync", async (
            int campaignId,
            EncounterLootSyncRequest req,
            HttpContext ctx,
            LoomWeaverMySqlRepository repo,
            IHubContext<TableRealtimeHub> hub,
            CancellationToken ct) =>
        {
            var access = await CampaignAccessResolver.ResolveAsync(ctx, campaignId, null, ct);
            if (!access.IsMember) return Results.StatusCode(403);

            var recapId = string.IsNullOrWhiteSpace(req.RecapId)
                ? $"recap-{campaignId}-s{Math.Max(1, req.SessionNumber)}"
                : req.RecapId.Trim();
            var sessionNum = Math.Max(1, req.SessionNumber);
            var sessionTitle = string.IsNullOrWhiteSpace(req.SessionTitle)
                ? $"Session {sessionNum}"
                : req.SessionTitle.Trim();
            var encounterTitle = string.IsNullOrWhiteSpace(req.EncounterTitle)
                ? "Dungeon Encounter"
                : req.EncounterTitle.Trim();
            var summary = string.IsNullOrWhiteSpace(req.LoomSummaryText)
                ? $"In Session {sessionNum} ({sessionTitle} — {encounterTitle}), the party defeated {req.DefeatedBodyCount} enemies and looted {req.TotalGoldGp} GP total."
                : req.LoomSummaryText.Trim();

            var record = new StoredEncounterLootRecord(
                recapId,
                campaignId,
                sessionNum,
                string.IsNullOrWhiteSpace(req.SessionId) ? $"session-{sessionNum}" : req.SessionId.Trim(),
                sessionTitle,
                string.IsNullOrWhiteSpace(req.EncounterId) ? "enc-active" : req.EncounterId.Trim(),
                encounterTitle,
                Math.Max(0, req.DefeatedBodyCount),
                Math.Max(0, req.TotalGoldGp),
                Math.Max(0, req.RemainingGoldGp),
                summary,
                req.StateJson.Clone(),
                DateTimeOffset.UtcNow);

            ActiveByCampaign[campaignId] = record;
            UpsertHistory(campaignId, record);

            // Upsert canonical note into The Loom memory so any player or GM query recalls it immediately
            var noteTitle = $"Session {sessionNum} Loot & Encounter Ledger · {encounterTitle}";
            LoomAndWeaveEndpoints.UpsertCanonicalNote(
                campaignId,
                $"note-loot-{recapId}",
                noteTitle,
                summary,
                sessionNum,
                access.Username,
                "/arcane-screen");

            // Persist to MySQL play events when database connection is available
            try
            {
                await using var db = await repo.OpenConnectionAsync(ct);
                await using var cmd = new MySqlCommand("""
                    INSERT INTO lw_play_events (campaign_id, session_id, event_kind, actor_label, summary, payload_json)
                    VALUES (@c, @s, 'encounter_loot_summary', @actor, @summary, @payload)
                    """, db);
                cmd.Parameters.AddWithValue("@c", campaignId);
                cmd.Parameters.AddWithValue("@s", record.SessionId);
                cmd.Parameters.AddWithValue("@actor", access.Username);
                cmd.Parameters.AddWithValue("@summary", summary.Length > 480 ? summary[..480] : summary);
                cmd.Parameters.AddWithValue("@payload", req.StateJson.GetRawText());
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch
            {
                // Continue with in-memory + SignalR sync when offline
            }

            // Broadcast VTT event to all seats in the campaign table
            var vttEvt = new VttRealtimeEvent(
                "encounter_recap_sync",
                access.Username,
                req.StateJson.GetRawText());
            await hub.Clients.Group(TableRealtimeHub.GroupName(campaignId))
                .SendAsync("VttEventReceived", vttEvt, ct);

            return Results.Ok(new
            {
                recapId = record.RecapId,
                sessionNumber = record.SessionNumber,
                totalGoldGp = record.TotalGoldGp,
                remainingGoldGp = record.RemainingGoldGp,
                loomSummaryText = record.LoomSummaryText
            });
        });
    }

    public static IReadOnlyList<StoredEncounterLootRecord> GetHistory(int campaignId)
    {
        if (!HistoryByCampaign.TryGetValue(campaignId, out var list)) return [];
        lock (list)
        {
            return list.OrderByDescending(x => x.UpdatedAt).ToList();
        }
    }

    public static IReadOnlyList<LoomCitationDto> GetMatchingLoomCitations(int campaignId, string query)
    {
        var history = GetHistory(campaignId);
        if (history.Count == 0) return [];

        var q = (query ?? string.Empty).Trim().ToLowerInvariant();
        var isLootOrGoldQuery =
            q.Contains("gold") || q.Contains("gp") || q.Contains("loot") ||
            q.Contains("treasure") || q.Contains("defeat") || q.Contains("dungeon") ||
            q.Contains("encounter") || q.Contains("sword") || q.Contains("claim") ||
            q.Contains("item") || q.Contains("reward") || q.Contains("got");

        var matching = history
            .Where(h =>
                string.IsNullOrWhiteSpace(q) ||
                isLootOrGoldQuery ||
                q.Contains($"session {h.SessionNumber}") ||
                h.LoomSummaryText.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                h.EncounterTitle.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                h.SessionTitle.Contains(q, StringComparison.OrdinalIgnoreCase))
            .Take(4)
            .Select(h => new LoomCitationDto(
                $"{campaignId}:EncounterLoot:{h.RecapId}",
                $"Session {h.SessionNumber} Encounter & Loot Summary · {h.EncounterTitle}",
                "EncounterLoot",
                h.LoomSummaryText,
                "/arcane-screen",
                "players"))
            .ToList();

        return matching;
    }

    private static void UpsertHistory(int campaignId, StoredEncounterLootRecord record)
    {
        var list = HistoryByCampaign.GetOrAdd(campaignId, _ => new List<StoredEncounterLootRecord>());
        lock (list)
        {
            var idx = list.FindIndex(x => x.RecapId == record.RecapId);
            if (idx >= 0) list[idx] = record;
            else list.Insert(0, record);
        }
    }
}
