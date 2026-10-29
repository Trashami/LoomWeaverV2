using System.Collections.Concurrent;
using LoomWeaver.Domain;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;

namespace LoomWeaver.Modules.Realtime;

public static class TableRealtimeEndpoints
{
    private static readonly ConcurrentQueue<TableRealtimeEventContract> EventStream = new(new[]
    {
        new TableRealtimeEventContract(
            "evt-seed-303",
            1,
            "dice_rolled",
            "Fivi",
            "Rolled 1d20+8 (ADV) = 28 · Natural 20 Solar Supernova Burst triggered on Bound Dragon.",
            "{\"sides\":20,\"total\":28,\"isNat20\":true}",
            DateTimeOffset.UtcNow.AddMinutes(-3)
        ),
        new TableRealtimeEventContract(
            "evt-seed-302",
            1,
            "token_moved",
            "Munk",
            "Moved frontline token 30 ft to Cinth Ballroom Upper Balcony (Grid 14, 8).",
            "{\"gridX\":14,\"gridZ\":8}",
            DateTimeOffset.UtcNow.AddMinutes(-6)
        ),
        new TableRealtimeEventContract(
            "evt-seed-301",
            1,
            "audio_transition",
            "GM · Trashami",
            "Crossfaded table soundscape to 'Shadow Beneath the Mountain' (3.2s ramp).",
            "{\"presetId\":\"preset-shadow-mountain\"}",
            DateTimeOffset.UtcNow.AddMinutes(-9)
        )
    });

    private static readonly List<TablePresenceSeatContract> ConnectedSeats = new()
    {
        new("seat-gm", "Trashami (Game Master)", "gm", "GM", "Broadcasting Live", "/arcane-screen", 14),
        new("seat-dal", "Dal (Heir in Exile)", "players", "Dal", "Connected · Free Seat", "/campaigns", 22),
        new("seat-fivi", "Fivi (Arcane Trickster)", "players", "Fivi", "Connected · Free Seat", "/dice", 19),
        new("seat-kildrid", "Kildrid (Stone-Scholar)", "players", "Kildrid", "Connected · Free Seat", "/maps", 27),
        new("seat-kycius", "Kycius (Spellblade)", "players", "Kycius", "Connected · Free Seat", "/effects", 24),
        new("seat-munk", "Munk (Vanguard)", "players", "Munk", "Connected · Free Seat", "/arcane-screen", 18)
    };

    public static TableRealtimeEventContract RecordEvent(
        int campaignId,
        string eventType,
        string actorName,
        string summary,
        string payloadJson)
    {
        var evt = new TableRealtimeEventContract(
            $"evt-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
            campaignId,
            string.IsNullOrWhiteSpace(eventType) ? "table_sync" : eventType.Trim(),
            string.IsNullOrWhiteSpace(actorName) ? "Table Seat" : actorName.Trim(),
            string.IsNullOrWhiteSpace(summary) ? "Synchronized table state." : summary.Trim(),
            string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson,
            DateTimeOffset.UtcNow
        );

        EventStream.Enqueue(evt);
        while (EventStream.Count > 30)
        {
            EventStream.TryDequeue(out _);
        }

        return evt;
    }

    /// <summary>GM-only events: type prefixed "gm_" or payload marked "visibility":"gm".</summary>
    public static bool IsGmOnly(string? eventType, string? payloadJson) =>
        (eventType ?? string.Empty).StartsWith("gm_", StringComparison.OrdinalIgnoreCase) ||
        (payloadJson ?? string.Empty).Replace(" ", string.Empty)
            .Contains("\"visibility\":\"gm\"", StringComparison.OrdinalIgnoreCase);

    public static RouteGroupBuilder MapTableRealtimeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/realtime/presence", (int campaignId, HttpContext ctx) =>
        {
            var access = CampaignAccessResolver.Resolve(ctx, campaignId);
            return Results.Ok(new
            {
                campaignId,
                hubEndpoint = "/hubs/table",
                protocol = "SignalR WebSocket + BroadcastChannel Dual Sync",
                seats = ConnectedSeats,
                recentEvents = EventStream.Reverse()
                    .Where(e => e.CampaignId == campaignId)
                    .Where(e => access.IsEffectiveGm || !IsGmOnly(e.EventType, e.PayloadJson))
                    .Take(12)
                    .ToList()
            });
        });

        api.MapPost("/campaigns/{campaignId:int}/realtime/events", async (
            int campaignId,
            PublishRealtimeEventRequest req,
            HttpContext ctx,
            IHubContext<TableRealtimeHub> hubContext) =>
        {
            var access = CampaignAccessResolver.Resolve(ctx, campaignId);
            var gmOnly = IsGmOnly(req.EventType, req.PayloadJson);
            if (gmOnly && !access.IsAccountGm)
            {
                return Results.Json(new { message = "Only the GM can send GM-only table events." }, statusCode: StatusCodes.Status403Forbidden);
            }

            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            var evt = RecordEvent(
                campaignId,
                req.EventType,
                user?.DisplayName ?? access.Username,
                req.Summary,
                req.PayloadJson ?? "{}"
            );

            await hubContext.Clients
                .Group(gmOnly ? TableRealtimeHub.GmGroupName(campaignId) : TableRealtimeHub.GroupName(campaignId))
                .SendAsync("TableEventReceived", evt);

            return Results.Ok(evt);
        });

        return api;
    }
}
