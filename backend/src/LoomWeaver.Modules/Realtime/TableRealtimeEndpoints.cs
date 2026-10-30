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
            "Player",
            "Rolled 1d20+8 (ADV) = 28 · Natural 20 Solar Supernova Burst triggered on Bound Dragon.",
            "{\"sides\":20,\"total\":28,\"isNat20\":true}",
            DateTimeOffset.UtcNow.AddMinutes(-3)
        ),
        new TableRealtimeEventContract(
            "evt-seed-302",
            1,
            "token_moved",
            "Player",
            "Moved frontline token 30 ft to Upper Balcony (Grid 14, 8).",
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

    /// <summary>GM-only events have a "gm_" type or a restricted/malformed payload visibility.</summary>
    public static bool IsGmOnly(string? eventType, string? payloadJson)
    {
        if ((eventType ?? string.Empty).StartsWith("gm_", StringComparison.OrdinalIgnoreCase)) return true;
        if (string.IsNullOrWhiteSpace(payloadJson)) return false;
        try
        {
            using var payload = JsonDocument.Parse(payloadJson);
            return HasRestrictedVisibility(payload.RootElement);
        }
        catch (JsonException)
        {
            return true;
        }
    }

    private static bool HasRestrictedVisibility(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Name.Equals("visibility", StringComparison.OrdinalIgnoreCase))
                {
                    if (property.Value.ValueKind != JsonValueKind.String) return true;
                    var value = property.Value.GetString();
                    if (!string.Equals(value, "players", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(value, "public", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }
                }

                if (HasRestrictedVisibility(property.Value)) return true;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (HasRestrictedVisibility(item)) return true;
            }
        }

        return false;
    }

    public static RouteGroupBuilder MapTableRealtimeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/campaigns/{campaignId:int}/realtime/presence", async (
            int campaignId, HttpContext ctx, LoomWeaverMySqlRepository mysql,
            IHubContext<TableRealtimeHub> hubContext, CancellationToken ct) =>
        {
            var access = CampaignAccessResolver.Resolve(ctx, campaignId);
            await TableRealtimeHub.ReconcileCampaignConnectionsAsync(
                mysql, hubContext.Groups, campaignId, ct);
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
            await TableRealtimeHub.ReconcileCampaignConnectionsAsync(
                mysql, hubContext.Groups, campaignId, ct);
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
