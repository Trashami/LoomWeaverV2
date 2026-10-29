using System.Collections.Concurrent;
using System.Text.Json;
using LoomWeaver.Infrastructure.MySql;
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
    public static bool IsGmOnly(string? eventType, string? payloadJson)
    {
        if ((eventType ?? string.Empty).StartsWith("gm_", StringComparison.OrdinalIgnoreCase)) return true;
        if (string.IsNullOrWhiteSpace(payloadJson)) return false;
        try
        {
            using var payload = JsonDocument.Parse(payloadJson);
            return payload.RootElement.ValueKind == JsonValueKind.Object &&
                   payload.RootElement.TryGetProperty("visibility", out var visibility) &&
                   visibility.ValueKind == JsonValueKind.String &&
                   string.Equals(visibility.GetString(), "gm", StringComparison.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static RouteGroupBuilder MapTableRealtimeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/realtime/presence", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository mysql, CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(ctx, campaignId);
            return Results.Ok(new
            {
                campaignId,
                hubEndpoint = "/hubs/table",
                protocol = "SignalR WebSocket",
                seats = TableRealtimeHub.ConnectedSeats(campaignId),
                recentEvents = await CampaignPlayEventStore.ListRecentAsync(mysql, campaignId, access.IsEffectiveGm, 12, ct)
            });
        });

        api.MapPost("/campaigns/{campaignId:int}/realtime/events", async (
            int campaignId,
            PublishRealtimeEventRequest req,
            HttpContext ctx,
            IHubContext<TableRealtimeHub> hubContext,
            LoomWeaverMySqlRepository mysql,
            CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(ctx, campaignId);
            var gmOnly = IsGmOnly(req.EventType, req.PayloadJson);
            if (gmOnly && !access.IsAccountGm)
            {
                return Results.Json(new { message = "Only the GM can send GM-only table events." }, statusCode: StatusCodes.Status403Forbidden);
            }

            var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
            if (user is null) return Results.Unauthorized();
            var evt = await CampaignPlayEventStore.AppendAsync(
                mysql,
                campaignId,
                req.EventType,
                user.DisplayName,
                req.Summary,
                req.PayloadJson ?? "{}",
                ct);

            await hubContext.Clients
                .Group(gmOnly ? TableRealtimeHub.GmGroupName(campaignId) : TableRealtimeHub.GroupName(campaignId))
                .SendAsync("TableEventReceived", evt);

            return Results.Ok(evt);
        });

        return api;
    }
}
