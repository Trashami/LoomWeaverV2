using System.Collections.Concurrent;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Auth;

public sealed record LwNotificationDto(
    string Id,
    string RecipientUsername,
    string RecipientEmail,
    int CampaignId,
    string CampaignName,
    string Category,
    string Title,
    string Message,
    string? RouteLink,
    string? ActionLabel,
    string? ActorName,
    bool IsRead,
    DateTimeOffset CreatedAt);

public sealed record CreateNotificationRequest(
    string? RecipientUsername,
    string? RecipientEmail,
    int CampaignId,
    string? CampaignName,
    string? Category,
    string? Title,
    string? Message,
    string? RouteLink,
    string? ActionLabel,
    string? ActorName,
    bool? BroadcastToCampaign);

/// <summary>
/// Real-time and persistent platform notifications for LoomWeaver:
/// Campaign Invites, Player Joined, Upcoming Live Sessions, Character Level Up,
/// Loot / Items Awarded, and Published Notes & Lore.
/// </summary>
public static class UserNotificationEndpoints
{
    private static volatile bool _schemaEnsured;
    private static readonly ConcurrentDictionary<string, LwNotificationDto> InMemoryNotifications = new(StringComparer.OrdinalIgnoreCase);

    public static RouteGroupBuilder MapUserNotificationEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/notifications", ListNotificationsAsync);
        api.MapPost("/notifications", CreateNotificationAsync);
        api.MapPost("/notifications/{id}/read", MarkNotificationReadAsync);
        api.MapPost("/notifications/read-all", MarkAllNotificationsReadAsync);
        return api;
    }

    public static async Task EnsureTableAsync(MySqlConnection db, CancellationToken ct = default)
    {
        if (_schemaEnsured) return;
        try
        {
            await using var cmd = new MySqlCommand("""
                CREATE TABLE IF NOT EXISTS lw_user_notifications (
                    id VARCHAR(80) NOT NULL PRIMARY KEY,
                    recipient_username VARCHAR(64) NOT NULL DEFAULT '',
                    recipient_email VARCHAR(255) NOT NULL DEFAULT '',
                    campaign_id INT NOT NULL DEFAULT 0,
                    campaign_name VARCHAR(160) NOT NULL DEFAULT '',
                    category VARCHAR(48) NOT NULL DEFAULT 'general',
                    title VARCHAR(200) NOT NULL,
                    message TEXT NOT NULL,
                    route_link VARCHAR(255) NULL,
                    action_label VARCHAR(80) NULL,
                    actor_name VARCHAR(128) NULL,
                    is_read TINYINT(1) NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_notif_user (recipient_username),
                    INDEX idx_notif_email (recipient_email),
                    INDEX idx_notif_campaign (campaign_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """, db);
            await cmd.ExecuteNonQueryAsync(ct);
            _schemaEnsured = true;
        }
        catch
        {
            // Fallback to in-memory dictionary if DDL is restricted
        }
    }

    public static async Task EmitNotificationAsync(
        LoomWeaverMySqlRepository repo,
        LwNotificationDto dto,
        CancellationToken ct = default)
    {
        InMemoryNotifications[dto.Id] = dto;
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureTableAsync(db, ct);
            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_user_notifications
                    (id, recipient_username, recipient_email, campaign_id, campaign_name, category, title, message, route_link, action_label, actor_name, is_read, created_at)
                VALUES
                    (@id, @ru, @re, @cid, @cname, @cat, @title, @msg, @link, @act, @actor, @read, @created)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    message = VALUES(message),
                    is_read = VALUES(is_read)
                """, db);
            cmd.Parameters.AddWithValue("@id", dto.Id);
            cmd.Parameters.AddWithValue("@ru", dto.RecipientUsername ?? string.Empty);
            cmd.Parameters.AddWithValue("@re", dto.RecipientEmail ?? string.Empty);
            cmd.Parameters.AddWithValue("@cid", dto.CampaignId);
            cmd.Parameters.AddWithValue("@cname", dto.CampaignName ?? string.Empty);
            cmd.Parameters.AddWithValue("@cat", dto.Category ?? "general");
            cmd.Parameters.AddWithValue("@title", dto.Title ?? "Notification");
            cmd.Parameters.AddWithValue("@msg", dto.Message ?? string.Empty);
            cmd.Parameters.AddWithValue("@link", (object?)dto.RouteLink ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@act", (object?)dto.ActionLabel ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@actor", (object?)dto.ActorName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@read", dto.IsRead ? 1 : 0);
            cmd.Parameters.AddWithValue("@created", dto.CreatedAt.UtcDateTime);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch { }
    }

    private static async Task<IResult> ListNotificationsAsync(
        HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null) return Results.Ok(Array.Empty<LwNotificationDto>());

        var cleanUser = (user.Username ?? string.Empty).Trim().TrimStart('@');
        var cleanEmail = (user.Email ?? string.Empty).Trim();
        var results = new Dictionary<string, LwNotificationDto>(StringComparer.OrdinalIgnoreCase);

        // 1. Get user's memberships (which also heals synthetic emails for invited players like SBrogan!)
        var memberships = await CampaignMembershipStore.ListForUserAsync(repo, user, ct);
        var baseCampaigns = await repo.GetCampaignsAsync(ct);
        var campaignIds = memberships.Select(m => m.CampaignId).ToHashSet();

        // 2. Synthesize pending campaign invite notifications so invited players ALWAYS see their invite
        foreach (var m in memberships)
        {
            if (m.IsGm) continue;
            var isPending = string.Equals(m.InviteStatus, "pending", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(m.CharacterKey);
            if (!isPending) continue;

            var camp = baseCampaigns.FirstOrDefault(c => c.Id == m.CampaignId);
            var campName = camp?.Name ?? $"Campaign #{m.CampaignId}";
            var inviteNotifId = $"invite-camp-{m.CampaignId}-{cleanUser.ToLowerInvariant()}";

            results[inviteNotifId] = new LwNotificationDto(
                Id: inviteNotifId,
                RecipientUsername: cleanUser,
                RecipientEmail: cleanEmail,
                CampaignId: m.CampaignId,
                CampaignName: campName,
                Category: "campaign_invite",
                Title: $"Campaign Invite: {campName}",
                Message: $"You have been invited to join {campName}. Select an existing character or create a new character to join the campaign roster.",
                RouteLink: $"/home?joinCampaign={m.CampaignId}",
                ActionLabel: "Join & Choose Character",
                ActorName: "Dungeon Master",
                IsRead: false,
                CreatedAt: DateTimeOffset.UtcNow.AddMinutes(-2));
        }

        // 3. Load persisted notifications from MySQL
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureTableAsync(db, ct);

            await using var cmd = new MySqlCommand("""
                SELECT id, recipient_username, recipient_email, campaign_id, campaign_name, category,
                       title, message, route_link, action_label, actor_name, is_read, created_at
                FROM lw_user_notifications
                WHERE (@u <> '' AND LOWER(recipient_username) = LOWER(@u))
                   OR (@e <> '' AND LOWER(recipient_email) = LOWER(@e))
                   OR (@u <> '' AND LOWER(SUBSTRING_INDEX(recipient_email, '@', 1)) = LOWER(@u))
                   OR recipient_username = '*'
                ORDER BY created_at DESC
                LIMIT 60
                """, db);
            cmd.Parameters.AddWithValue("@u", cleanUser);
            cmd.Parameters.AddWithValue("@e", cleanEmail);

            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var id = r.GetString(0);
                var recUser = r.GetString(1);
                var campId = r.GetInt32(3);
                if (recUser == "*" && campId > 0 && !campaignIds.Contains(campId))
                    continue;

                results[id] = new LwNotificationDto(
                    Id: id,
                    RecipientUsername: recUser,
                    RecipientEmail: r.GetString(2),
                    CampaignId: campId,
                    CampaignName: r.GetString(4),
                    Category: r.GetString(5),
                    Title: r.GetString(6),
                    Message: r.GetString(7),
                    RouteLink: r.IsDBNull(8) ? null : r.GetString(8),
                    ActionLabel: r.IsDBNull(9) ? null : r.GetString(9),
                    ActorName: r.IsDBNull(10) ? null : r.GetString(10),
                    IsRead: r.GetBoolean(11),
                    CreatedAt: new DateTimeOffset(DateTime.SpecifyKind(r.GetDateTime(12), DateTimeKind.Utc)));
            }
        }
        catch { }

        // 4. Merge in-memory notifications
        foreach (var kv in InMemoryNotifications)
        {
            var n = kv.Value;
            var matchesUser = (!string.IsNullOrWhiteSpace(cleanUser) && string.Equals(n.RecipientUsername, cleanUser, StringComparison.OrdinalIgnoreCase))
                || (!string.IsNullOrWhiteSpace(cleanEmail) && string.Equals(n.RecipientEmail, cleanEmail, StringComparison.OrdinalIgnoreCase))
                || (n.RecipientUsername == "*" && (n.CampaignId == 0 || campaignIds.Contains(n.CampaignId)));
            if (matchesUser && !results.ContainsKey(n.Id))
            {
                results[n.Id] = n;
            }
        }

        // 5. For GM accounts, also surface pending/joined player notifications from lw_campaign_members
        foreach (var m in memberships.Where(x => x.IsGm))
        {
            try
            {
                var camp = baseCampaigns.FirstOrDefault(c => c.Id == m.CampaignId);
                var campName = camp?.Name ?? $"Campaign #{m.CampaignId}";
                var members = await CampaignMembershipStore.ListMembersAsync(repo, m.CampaignId, ct);
                foreach (var row in members)
                {
                    if (string.Equals(row.MemberRole, "gm", StringComparison.OrdinalIgnoreCase)) continue;
                    var pUser = row.Username ?? row.Email.Split('@')[0];
                    var pDisp = row.DisplayName ?? pUser;
                    if (!string.IsNullOrWhiteSpace(row.CharacterKey) && string.Equals(row.InviteStatus, "active", StringComparison.OrdinalIgnoreCase))
                    {
                        var joinId = $"member-joined-{m.CampaignId}-{pUser.ToLowerInvariant()}";
                        if (!results.ContainsKey(joinId))
                        {
                            results[joinId] = new LwNotificationDto(
                                Id: joinId,
                                RecipientUsername: cleanUser,
                                RecipientEmail: cleanEmail,
                                CampaignId: m.CampaignId,
                                CampaignName: campName,
                                Category: "player_joined",
                                Title: $"{pDisp} Joined {campName}",
                                Message: $"{pDisp} (@{pUser}) is active in {campName} playing {row.CharacterName ?? row.CharacterKey}.",
                                RouteLink: "/home",
                                ActionLabel: "View Roster",
                                ActorName: pDisp,
                                IsRead: true,
                                CreatedAt: DateTimeOffset.UtcNow.AddHours(-2));
                        }
                    }
                }
            }
            catch { }
        }

        var sorted = results.Values
            .OrderBy(n => n.IsRead ? 1 : 0)
            .ThenByDescending(n => n.CreatedAt)
            .ToList();

        return Results.Ok(sorted);
    }

    private static async Task<IResult> CreateNotificationAsync(
        CreateNotificationRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        var id = $"notif-{Guid.NewGuid():N}"[..24];
        var recUser = req.BroadcastToCampaign == true
            ? "*"
            : (req.RecipientUsername ?? string.Empty).Trim().TrimStart('@');
        var recEmail = (req.RecipientEmail ?? string.Empty).Trim();

        if (!string.IsNullOrWhiteSpace(recUser) && recUser != "*" && string.IsNullOrWhiteSpace(recEmail))
        {
            try
            {
                await using var db = await repo.OpenConnectionAsync(ct);
                var resolved = await CampaignMembershipStore.ResolveUserIdentityAsync(db, recUser, null, null, ct);
                recEmail = resolved.CanonicalEmail;
                recUser = resolved.CanonicalUsername;
            }
            catch { }
        }

        var dto = new LwNotificationDto(
            Id: id,
            RecipientUsername: string.IsNullOrWhiteSpace(recUser) ? "*" : recUser,
            RecipientEmail: recEmail,
            CampaignId: req.CampaignId,
            CampaignName: req.CampaignName ?? "Campaign",
            Category: req.Category ?? "general",
            Title: req.Title ?? "Campaign Update",
            Message: req.Message ?? string.Empty,
            RouteLink: req.RouteLink ?? "/home",
            ActionLabel: req.ActionLabel ?? "Open",
            ActorName: req.ActorName ?? caller?.DisplayName ?? caller?.Username ?? "LoomWeaver",
            IsRead: false,
            CreatedAt: DateTimeOffset.UtcNow);

        await EmitNotificationAsync(repo, dto, ct);
        return Results.Ok(dto);
    }

    private static async Task<IResult> MarkNotificationReadAsync(
        string id, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        if (InMemoryNotifications.TryGetValue(id, out var existing))
        {
            InMemoryNotifications[id] = existing with { IsRead = true };
        }
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureTableAsync(db, ct);
            await using var cmd = new MySqlCommand(
                "UPDATE lw_user_notifications SET is_read = 1 WHERE id = @id", db);
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch { }

        return Results.Ok(new { id, isRead = true });
    }

    private static async Task<IResult> MarkAllNotificationsReadAsync(
        HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null) return Results.Unauthorized();

        var cleanUser = (user.Username ?? string.Empty).Trim().TrimStart('@');
        var cleanEmail = (user.Email ?? string.Empty).Trim();

        foreach (var kv in InMemoryNotifications.ToArray())
        {
            if (string.Equals(kv.Value.RecipientUsername, cleanUser, StringComparison.OrdinalIgnoreCase)
                || string.Equals(kv.Value.RecipientEmail, cleanEmail, StringComparison.OrdinalIgnoreCase))
            {
                InMemoryNotifications[kv.Key] = kv.Value with { IsRead = true };
            }
        }

        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureTableAsync(db, ct);
            await using var cmd = new MySqlCommand("""
                UPDATE lw_user_notifications
                SET is_read = 1
                WHERE (@u <> '' AND LOWER(recipient_username) = LOWER(@u))
                   OR (@e <> '' AND LOWER(recipient_email) = LOWER(@e))
                """, db);
            cmd.Parameters.AddWithValue("@u", cleanUser);
            cmd.Parameters.AddWithValue("@e", cleanEmail);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch { }

        return Results.Ok(new { markedAllRead = true });
    }
}
