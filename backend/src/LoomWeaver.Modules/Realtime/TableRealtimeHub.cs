using System.Collections.Concurrent;
using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using LoomWeaver.Modules.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;

namespace LoomWeaver.Modules.Realtime;

/// <summary>
/// Live table hub. Connections are authenticated by CampaignAccessMiddleware; joining a
/// campaign table requires a lw_campaign_members row, and the seat role is derived from
/// that row (never from the client). GM-only events are delivered to the GM group only.
/// </summary>
public sealed class TableRealtimeHub(LoomWeaverMySqlRepository repo) : Hub
{
    private sealed record LiveConnection(int CampaignId, StoredUserRecord User, CampaignMembership Membership);
    private static readonly ConcurrentDictionary<string, LiveConnection> Seats = new();
    private const int MaxVttPayloadChars = 16_000;
    private static readonly HashSet<string> PersistedVttEventTypes = new(StringComparer.Ordinal) { "turn_changed", "effect_cast" };

    public static string GroupName(int campaignId) => $"campaign-{campaignId}";
    public static string GmGroupName(int campaignId) => $"campaign-{campaignId}-gm";

    public async Task JoinCampaignTable(int campaignId, string? actorName = null, string? role = null)
    {
        var user = CurrentUser();
        await RemoveCurrentSeatGroupsAsync();
        Seats.TryRemove(Context.ConnectionId, out _);

        var membership = await CampaignMembershipStore.FindAsync(repo, campaignId, user, Context.ConnectionAborted);
        if (membership is null)
        {
            throw new HubException("You are not a member of this campaign.");
        }

        await ReconcileCampaignConnectionsAsync(repo, Groups, campaignId, Context.ConnectionAborted);
        membership = await CampaignMembershipStore.FindAsync(repo, campaignId, user, Context.ConnectionAborted);
        if (membership is null)
        {
            throw new HubException("Campaign membership is no longer active.");
        }

        Seats[Context.ConnectionId] = new LiveConnection(campaignId, user, membership);
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(campaignId));
        if (membership.IsGm)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GmGroupName(campaignId));
        }

        var seatRole = membership.IsGm ? "GM" : "PLAYER";
        var evt = await CampaignPlayEventStore.AppendAsync(
            repo,
            campaignId,
            "seat_joined",
            user.DisplayName,
            $"{user.DisplayName} ({seatRole}) connected to the live table.",
            "{}",
            Context.ConnectionAborted);
        await Clients.Group(GroupName(campaignId)).SendAsync("TableEventReceived", evt);
    }

    public async Task BroadcastTableAction(int campaignId, PublishRealtimeEventRequest request)
    {
        var user = CurrentUser();
        var seat = await RequireSeatAsync(campaignId);
        seat = seat with { User = user };
        Seats[Context.ConnectionId] = seat;

        var gmOnly = TableRealtimeEndpoints.IsGmOnly(request.EventType, request.PayloadJson);
        if (gmOnly && !seat.Membership.IsGm)
        {
            throw new HubException("Only the GM can send GM-only table events.");
        }

        var evt = await CampaignPlayEventStore.AppendAsync(
            repo,
            campaignId,
            request.EventType,
            user.DisplayName,
            request.Summary,
            request.PayloadJson ?? "{}",
            Context.ConnectionAborted);
        await Clients.Group(gmOnly ? GmGroupName(campaignId) : GroupName(campaignId)).SendAsync("TableEventReceived", evt);
    }

    /// <summary>
    /// Relays a VTT event. Only turn_changed and effect_cast are persisted to the play log; every other
    /// type (including token_moved) is ephemeral. gm_* and fog_* events go to the GM group only.
    /// </summary>
    public async Task BroadcastVttEvent(int campaignId, VttRealtimeEvent evt)
    {
        var user = CurrentUser();
        var seat = await RequireSeatAsync(campaignId);
        seat = seat with { User = user };
        Seats[Context.ConnectionId] = seat;

        var type = (evt.Type ?? string.Empty).Trim();
        if (type.Length is 0 or > 64) throw new HubException("A VTT event type is required (max 64 characters).");
        if ((evt.ActorKey?.Length ?? 0) > 128) throw new HubException("The VTT actor key is too long.");
        var payload = string.IsNullOrWhiteSpace(evt.PayloadJson) ? "{}" : evt.PayloadJson;
        if (payload.Length > MaxVttPayloadChars) throw new HubException("The VTT payload is too large.");
        try
        {
            using var _ = JsonDocument.Parse(payload);
        }
        catch (JsonException)
        {
            throw new HubException("The VTT payload must be valid JSON.");
        }

        var gmOnly = type.StartsWith("gm_", StringComparison.OrdinalIgnoreCase);
        if (gmOnly && !seat.Membership.IsGm)
        {
            throw new HubException("Only the GM can send GM-only table events.");
        }

        if (PersistedVttEventTypes.Contains(type))
        {
            var persisted = await CampaignPlayEventStore.AppendAsync(
                repo,
                campaignId,
                type,
                user.DisplayName,
                VttEventSummary(type, user.DisplayName),
                payload,
                Context.ConnectionAborted);
            await Clients.Group(GroupName(campaignId)).SendAsync("TableEventReceived", persisted);
            return;
        }

        var fogOrGm = gmOnly || type.StartsWith("fog_", StringComparison.OrdinalIgnoreCase);
        var relayed = evt with { Type = type, PayloadJson = payload };
        await Clients.Group(fogOrGm ? GmGroupName(campaignId) : GroupName(campaignId)).SendAsync("VttEventReceived", relayed);
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        Seats.TryRemove(Context.ConnectionId, out _);
        return base.OnDisconnectedAsync(exception);
    }

    private async Task<LiveConnection> RequireSeatAsync(int campaignId)
    {
        if (!Seats.TryGetValue(Context.ConnectionId, out var seat) || seat.CampaignId != campaignId)
        {
            throw new HubException("Join the campaign table before broadcasting.");
        }

        await ReconcileCampaignConnectionsAsync(repo, Groups, campaignId, Context.ConnectionAborted);
        if (!Seats.TryGetValue(Context.ConnectionId, out seat) || seat.CampaignId != campaignId)
        {
            throw new HubException("Campaign membership is no longer active.");
        }

        return seat;
    }

    private static string VttEventSummary(string type, string actorName) => type switch
    {
        "turn_changed" => $"{actorName} changed the turn order.",
        "effect_cast" => $"{actorName} cast an effect.",
        _ => $"{actorName} sent a VTT event."
    };

    private async Task RemoveCurrentSeatGroupsAsync()
    {
        if (!Seats.TryGetValue(Context.ConnectionId, out var seat)) return;
        await RemoveCampaignGroupsAsync(seat.CampaignId);
    }

    private async Task RemoveCampaignGroupsAsync(int campaignId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(campaignId));
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GmGroupName(campaignId));
    }

    public static async Task ReconcileCampaignConnectionsAsync(
        LoomWeaverMySqlRepository repo, IGroupManager groups, int campaignId, CancellationToken ct = default)
    {
        foreach (var pair in Seats.Where(pair => pair.Value.CampaignId == campaignId).ToArray())
        {
            var membership = await CampaignMembershipStore.FindAsync(repo, campaignId, pair.Value.User, ct);
            if (membership is null)
            {
                await groups.RemoveFromGroupAsync(pair.Key, GroupName(campaignId), ct);
                await groups.RemoveFromGroupAsync(pair.Key, GmGroupName(campaignId), ct);
                Seats.TryRemove(pair.Key, out _);
                continue;
            }

            await groups.RemoveFromGroupAsync(pair.Key, GmGroupName(campaignId), ct);
            if (membership.IsGm)
            {
                await groups.AddToGroupAsync(pair.Key, GmGroupName(campaignId), ct);
            }
            Seats[pair.Key] = pair.Value with { Membership = membership };
        }
    }

    public static IReadOnlyList<TablePresenceSeatContract> ConnectedSeats(int campaignId) =>
        Seats.Where(pair => pair.Value.CampaignId == campaignId)
            .Select(pair => new TablePresenceSeatContract(
                pair.Key,
                pair.Value.User.DisplayName,
                pair.Value.Membership.IsGm ? "gm" : "players",
                pair.Value.Membership.IsGm ? "GM" : pair.Value.Membership.CharacterKey ?? "Unassigned",
                "Connected",
                string.Empty,
                0))
            .ToArray();

    private StoredUserRecord CurrentUser()
    {
        var http = Context.GetHttpContext() ?? throw new HubException("Authentication required.");
        return AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(http) ?? throw new HubException("Authentication required.");
    }
}
