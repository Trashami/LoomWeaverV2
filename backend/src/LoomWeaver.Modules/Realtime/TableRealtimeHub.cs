using System.Collections.Concurrent;
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
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<int, CampaignMembership>> Seats = new();

    public static string GroupName(int campaignId) => $"campaign-{campaignId}";
    public static string GmGroupName(int campaignId) => $"campaign-{campaignId}-gm";

    public async Task JoinCampaignTable(int campaignId, string? actorName = null, string? role = null)
    {
        var user = CurrentUser();
        var membership = await CampaignMembershipStore.FindAsync(repo, campaignId, user, Context.ConnectionAborted)
            ?? throw new HubException("You are not a member of this campaign.");

        Seats.GetOrAdd(Context.ConnectionId, _ => new())[campaignId] = membership;
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(campaignId));
        if (membership.IsGm)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GmGroupName(campaignId));
        }

        var seatRole = membership.IsGm ? "GM" : "PLAYER";
        var evt = TableRealtimeEndpoints.RecordEvent(
            campaignId,
            "seat_joined",
            user.DisplayName,
            $"{user.DisplayName} ({seatRole}) connected to the live table.",
            "{}"
        );
        await Clients.Group(GroupName(campaignId)).SendAsync("TableEventReceived", evt);
    }

    public async Task BroadcastTableAction(int campaignId, PublishRealtimeEventRequest request)
    {
        var user = CurrentUser();
        if (!Seats.TryGetValue(Context.ConnectionId, out var seats) || !seats.TryGetValue(campaignId, out var membership))
        {
            throw new HubException("Join the campaign table before broadcasting.");
        }

        var gmOnly = TableRealtimeEndpoints.IsGmOnly(request.EventType, request.PayloadJson);
        if (gmOnly && !membership.IsGm)
        {
            throw new HubException("Only the GM can send GM-only table events.");
        }

        var evt = TableRealtimeEndpoints.RecordEvent(
            campaignId,
            request.EventType,
            user.DisplayName,
            request.Summary,
            request.PayloadJson ?? "{}"
        );
        await Clients.Group(gmOnly ? GmGroupName(campaignId) : GroupName(campaignId)).SendAsync("TableEventReceived", evt);
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        Seats.TryRemove(Context.ConnectionId, out _);
        return base.OnDisconnectedAsync(exception);
    }

    private StoredUserRecord CurrentUser()
    {
        var http = Context.GetHttpContext() ?? throw new HubException("Authentication required.");
        return AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(http) ?? throw new HubException("Authentication required.");
    }
}
