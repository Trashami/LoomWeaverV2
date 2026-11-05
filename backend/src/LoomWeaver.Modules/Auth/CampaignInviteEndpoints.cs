using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using LoomWeaver.Infrastructure.MySql;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using MySqlConnector;

namespace LoomWeaver.Modules.Auth;

public sealed record CreateCampaignRequest(string? Name, string? Subtitle, string? SystemCode, string? WorldName);
public sealed record CreateInviteRequest(string? Role, int? MaxUses, int? ExpiresInDays);
public sealed record RedeemInviteRequest(string? Token);
public sealed record AssignCharacterToMemberRequest(string? CharacterKey, string? PlayerUsername, string? PlayerEmail, string? PlayerAccountId);
public sealed record AddCampaignPlayerRequest(string? Username, string? DisplayName, string? Email, string? AssignedCharacterKey, string? InviteToken, string? InviteStatus);
public sealed record AcceptCampaignInviteRequest(string? CharacterKey, string? CharacterName, string? AncestryOrClan, string? ClassOrArchetype, int? Level, string? PlayerUsername);
public sealed record CampaignRulesConfigRequest(string? AbilityScoreRule);

/// <summary>Real campaign creation, invite token issuing, player roster management, and campaign rules.</summary>
public static partial class CampaignInviteEndpoints
{
    private static readonly string[] SystemCodes = ["dnd5e", "pf2e", "vampire_v5"];
    private static readonly ConcurrentDictionary<int, string> CampaignAbilityRules = new();

    public static RouteGroupBuilder MapCampaignInviteEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/campaigns", CreateCampaignAsync);
        api.MapPost("/campaigns/{campaignId:int}/invites", CreateInviteAsync);
        api.MapGet("/campaigns/{campaignId:int}/invites", ListInvitesAsync);
        api.MapDelete("/campaigns/{campaignId:int}/invites/{inviteId:long}", RevokeInviteAsync);
        api.MapPost("/invites/redeem", RedeemInviteAsync);
        api.MapGet("/campaigns/{campaignId:int}/members", ListCampaignMembersAsync);
        api.MapPost("/campaigns/{campaignId:int}/members/add", AddOrJoinCampaignMemberAsync);
        api.MapPost("/campaigns/{campaignId:int}/members/accept-invite", AcceptCampaignInviteAsync);
        api.MapPost("/campaigns/{campaignId:int}/members/assign-character", AssignCharacterToMemberAsync);
        api.MapDelete("/campaigns/{campaignId:int}/characters/{characterKey}", RemoveCharacterFromCampaignAsync);
        api.MapGet("/campaigns/{campaignId:int}/rules", (int campaignId) =>
            Results.Ok(new { campaignId, abilityScoreRule = CampaignAbilityRules.GetValueOrDefault(campaignId, "point_buy") }));
        api.MapPost("/campaigns/{campaignId:int}/rules", (int campaignId, CampaignRulesConfigRequest req) =>
        {
            var normalized = string.Equals(req.AbilityScoreRule, "roll_stats", StringComparison.OrdinalIgnoreCase) ? "roll_stats" : "point_buy";
            CampaignAbilityRules[campaignId] = normalized;
            return Results.Ok(new { campaignId, abilityScoreRule = normalized });
        });
        return api;
    }

    private static async Task<IResult> CreateCampaignAsync(
        CreateCampaignRequest body, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null) return Results.Unauthorized();
        var name = body.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 160)
            return Results.BadRequest(new { error = "A campaign name (1-160 characters) is required." });

        var system = SystemCodes.Contains(body.SystemCode) ? body.SystemCode! : "dnd5e";
        var slug = $"{Slugify(name)}-{Convert.ToHexString(RandomNumberGenerator.GetBytes(3)).ToLowerInvariant()}";

        await using var db = await repo.OpenConnectionAsync(ct);
        await CampaignMembershipStore.EnsureSchemaAsync(db, ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        await using var insert = new MySqlCommand("""
            INSERT INTO lw_campaigns (slug, name, subtitle, system_code, gm_user_id, world_name, current_act, current_location_name)
            SELECT @slug, @name, @sub, @sys, u.id, @world, 'ACT I', 'Unwritten'
            FROM lw_users u WHERE LOWER(u.email) = LOWER(@email) LIMIT 1
            """, db, tx);
        insert.Parameters.AddWithValue("@slug", slug);
        insert.Parameters.AddWithValue("@name", name);
        insert.Parameters.AddWithValue("@sub", (body.Subtitle ?? string.Empty).Trim());
        insert.Parameters.AddWithValue("@sys", system);
        insert.Parameters.AddWithValue("@email", user.Email.Trim());
        insert.Parameters.AddWithValue("@world", string.IsNullOrWhiteSpace(body.WorldName) ? name : body.WorldName.Trim());
        if (await insert.ExecuteNonQueryAsync(ct) != 1)
            return Results.Conflict(new { error = "Your account is not linked to the campaign identity store yet." });
        var campaignId = (int)insert.LastInsertedId;

        await using var member = new MySqlCommand("""
            INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role, invite_status, player_username, player_display_name)
            SELECT @c, u.id, @e, 'gm', 'active', @un, @dn FROM lw_users u WHERE LOWER(u.email) = LOWER(@e) LIMIT 1
            """, db, tx);
        member.Parameters.AddWithValue("@c", campaignId);
        member.Parameters.AddWithValue("@e", user.Email.Trim());
        member.Parameters.AddWithValue("@un", user.Username);
        member.Parameters.AddWithValue("@dn", user.DisplayName);
        if (await member.ExecuteNonQueryAsync(ct) != 1)
            throw new InvalidOperationException("Campaign creator membership could not be written.");
        await tx.CommitAsync(ct);

        return Results.Created($"/api/campaigns/{campaignId}", new { id = campaignId, slug, name, my_role = "dm" });
    }

    private static async Task<IResult> CreateInviteAsync(
        int campaignId, CreateInviteRequest? body, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var (user, error) = await RequireGmAsync(ctx, campaignId, repo, ct);
        if (error is not null) return error;

        var role = body?.Role == "spectator" ? "spectator" : "player";
        var maxUses = Math.Clamp(body?.MaxUses ?? 25, 1, 100);
        var days = Math.Clamp(body?.ExpiresInDays ?? 30, 1, 90);
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');

        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_campaign_invites (campaign_id, token_hash, member_role, created_by, max_uses, expires_at)
            VALUES (@c, @h, @r, @u, @m, DATE_ADD(UTC_TIMESTAMP(), INTERVAL @d DAY))
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@h", HashToken(token));
        cmd.Parameters.AddWithValue("@r", role);
        cmd.Parameters.AddWithValue("@u", user!.Id);
        cmd.Parameters.AddWithValue("@m", maxUses);
        cmd.Parameters.AddWithValue("@d", days);
        await cmd.ExecuteNonQueryAsync(ct);

        return Results.Ok(new
        {
            id = cmd.LastInsertedId, campaignId, role, maxUses, expiresInDays = days, inviteCode = token,
            inviteUrl = $"https://loom-weaver.com/home?joinCampaign={campaignId}&invite={token}"
        });
    }

    private static async Task<IResult> ListCampaignMembersAsync(
        int campaignId, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        try
        {
            var rows = await CampaignMembershipStore.ListMembersAsync(repo, campaignId, ct);
            var members = rows.Select(r =>
            {
                var uName = !string.IsNullOrWhiteSpace(r.Username) ? r.Username : r.Email.Split('@')[0];
                var dName = !string.IsNullOrWhiteSpace(r.DisplayName) ? r.DisplayName : uName;
                var isGm = string.Equals(r.MemberRole, "gm", StringComparison.OrdinalIgnoreCase);
                return new
                {
                    id = r.Id, accountId = $"user-{uName.ToLowerInvariant()}", userId = r.UserId, email = r.Email,
                    username = uName, displayName = dName, role = isGm ? "gm" : "players",
                    inviteStatus = isGm ? "active" : (r.InviteStatus ?? "active"),
                    assignedCharacterKey = r.CharacterKey, assignedCharacterName = r.CharacterName
                };
            }).ToList();
            return Results.Ok(members);
        }
        catch { return Results.Ok(Array.Empty<object>()); }
    }

    private static async Task<IResult> AddOrJoinCampaignMemberAsync(
        int campaignId, AddCampaignPlayerRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        var resolvedEmail = req.Email?.Trim() ?? string.Empty;
        var resolvedUser = (req.Username ?? string.Empty).Trim().TrimStart('@');
        var resolvedDisplay = (req.DisplayName ?? string.Empty).Trim();
        var isInvitedByAnotherUser = caller is not null
            && !string.IsNullOrWhiteSpace(resolvedUser)
            && !string.Equals(caller.Username, resolvedUser, StringComparison.OrdinalIgnoreCase);

        var inviteStatus = !string.IsNullOrWhiteSpace(req.InviteStatus)
            ? req.InviteStatus.Trim().ToLowerInvariant()
            : (!string.IsNullOrWhiteSpace(req.AssignedCharacterKey) ? "active" : "pending");

        var campaignName = $"Campaign #{campaignId}";
        try
        {
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            campaignName = baseCampaigns.FirstOrDefault(c => c.Id == campaignId)?.Name ?? campaignName;

            await using var db = await repo.OpenConnectionAsync(ct);
            await CampaignMembershipStore.EnsureSchemaAsync(db, ct);
            var identity = await CampaignMembershipStore.ResolveUserIdentityAsync(db, resolvedUser, resolvedEmail, resolvedDisplay, ct);
            resolvedEmail = identity.CanonicalEmail;
            resolvedUser = identity.CanonicalUsername;
            resolvedDisplay = identity.CanonicalDisplayName;

            var synthEmail = $"{resolvedUser.ToLowerInvariant()}@loom-weaver.com";
            if (!string.Equals(resolvedEmail, synthEmail, StringComparison.OrdinalIgnoreCase))
            {
                await using var cleanup = new MySqlCommand(
                    "DELETE FROM lw_campaign_members WHERE campaign_id = @c AND LOWER(auth_email) = LOWER(@synth) AND LOWER(auth_email) <> LOWER(@real)", db);
                cleanup.Parameters.AddWithValue("@c", campaignId);
                cleanup.Parameters.AddWithValue("@synth", synthEmail);
                cleanup.Parameters.AddWithValue("@real", resolvedEmail);
                await cleanup.ExecuteNonQueryAsync(ct);
            }

            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role, assigned_character_key, invite_status, player_username, player_display_name)
                VALUES (@c, @u, @e, 'player', @k, @st, @un, @dn)
                ON DUPLICATE KEY UPDATE
                    assigned_character_key = COALESCE(VALUES(assigned_character_key), assigned_character_key),
                    invite_status = CASE WHEN assigned_character_key IS NOT NULL OR VALUES(assigned_character_key) IS NOT NULL THEN 'active' ELSE VALUES(invite_status) END,
                    player_username = COALESCE(VALUES(player_username), player_username),
                    player_display_name = COALESCE(VALUES(player_display_name), player_display_name)
                """, db);
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@u", identity.CanonicalUserId);
            cmd.Parameters.AddWithValue("@e", resolvedEmail);
            cmd.Parameters.AddWithValue("@k", (object?)req.AssignedCharacterKey ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@st", inviteStatus);
            cmd.Parameters.AddWithValue("@un", resolvedUser);
            cmd.Parameters.AddWithValue("@dn", resolvedDisplay);
            await cmd.ExecuteNonQueryAsync(ct);

            if (isInvitedByAnotherUser || inviteStatus == "pending")
            {
                var dmName = caller?.DisplayName ?? caller?.Username ?? "Dungeon Master";
                await UserNotificationEndpoints.EmitNotificationAsync(repo, new LwNotificationDto(
                    Id: $"invite-camp-{campaignId}-{resolvedUser.ToLowerInvariant()}",
                    RecipientUsername: resolvedUser, RecipientEmail: resolvedEmail, CampaignId: campaignId, CampaignName: campaignName,
                    Category: "campaign_invite", Title: $"Campaign Invite: {campaignName}",
                    Message: $"{dmName} invited you to join {campaignName}. Select one of your characters or create a new character to join the party.",
                    RouteLink: $"/home?joinCampaign={campaignId}", ActionLabel: "Join & Choose Character", ActorName: dmName,
                    IsRead: false, CreatedAt: DateTimeOffset.UtcNow), ct);
            }
        }
        catch { }

        return Results.Ok(new
        {
            campaignId, accountId = $"user-{resolvedUser.ToLowerInvariant()}", email = resolvedEmail,
            username = resolvedUser, displayName = resolvedDisplay, role = "players", inviteStatus,
            assignedCharacterKey = req.AssignedCharacterKey
        });
    }

    private static async Task<IResult> AcceptCampaignInviteAsync(
        int campaignId, AcceptCampaignInviteRequest req, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var caller = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        var targetUsername = !string.IsNullOrWhiteSpace(req.PlayerUsername) ? req.PlayerUsername.Trim().TrimStart('@') : caller?.Username ?? "player";
        var targetEmail = caller?.Email ?? $"{targetUsername.ToLowerInvariant()}@loom-weaver.com";
        var targetDisplay = caller?.DisplayName ?? targetUsername;
        var charKey = req.CharacterKey?.Trim();
        var charName = req.CharacterName?.Trim();
        var campaignName = $"Campaign #{campaignId}";
        try
        {
            var baseCampaigns = await repo.GetCampaignsAsync(ct);
            campaignName = baseCampaigns.FirstOrDefault(c => c.Id == campaignId)?.Name ?? campaignName;

            await using var db = await repo.OpenConnectionAsync(ct);
            await CampaignMembershipStore.EnsureSchemaAsync(db, ct);
            var identity = await CampaignMembershipStore.ResolveUserIdentityAsync(db, targetUsername, targetEmail, targetDisplay, ct);
            targetEmail = identity.CanonicalEmail;
            targetUsername = identity.CanonicalUsername;
            targetDisplay = identity.CanonicalDisplayName;

            await using var cmd = new MySqlCommand("""
                INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role, assigned_character_key, character_name, invite_status, player_username, player_display_name)
                VALUES (@c, @u, @e, 'player', @k, @cn, 'active', @un, @dn)
                ON DUPLICATE KEY UPDATE
                    assigned_character_key = COALESCE(VALUES(assigned_character_key), assigned_character_key),
                    character_name = COALESCE(VALUES(character_name), character_name),
                    invite_status = 'active', player_username = COALESCE(VALUES(player_username), player_username),
                    player_display_name = COALESCE(VALUES(player_display_name), player_display_name)
                """, db);
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@u", identity.CanonicalUserId);
            cmd.Parameters.AddWithValue("@e", targetEmail);
            cmd.Parameters.AddWithValue("@k", (object?)charKey ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@cn", (object?)charName ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@un", targetUsername);
            cmd.Parameters.AddWithValue("@dn", targetDisplay);
            await cmd.ExecuteNonQueryAsync(ct);

            await using var updateByUser = new MySqlCommand("""
                UPDATE lw_campaign_members
                SET auth_email = @e, assigned_character_key = COALESCE(@k, assigned_character_key),
                    character_name = COALESCE(@cn, character_name), invite_status = 'active',
                    player_username = @un, player_display_name = @dn
                WHERE campaign_id = @c AND (LOWER(COALESCE(player_username, '')) = LOWER(@un) OR LOWER(SUBSTRING_INDEX(auth_email, '@', 1)) = LOWER(@un))
                """, db);
            updateByUser.Parameters.AddWithValue("@c", campaignId);
            updateByUser.Parameters.AddWithValue("@e", targetEmail);
            updateByUser.Parameters.AddWithValue("@k", (object?)charKey ?? DBNull.Value);
            updateByUser.Parameters.AddWithValue("@cn", (object?)charName ?? DBNull.Value);
            updateByUser.Parameters.AddWithValue("@un", targetUsername);
            updateByUser.Parameters.AddWithValue("@dn", targetDisplay);
            await updateByUser.ExecuteNonQueryAsync(ct);

            var charLabel = !string.IsNullOrWhiteSpace(charName) ? $" playing {charName}" : string.Empty;
            await UserNotificationEndpoints.EmitNotificationAsync(repo, new LwNotificationDto(
                Id: $"joined-{campaignId}-{targetUsername.ToLowerInvariant()}-{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}",
                RecipientUsername: "*", RecipientEmail: string.Empty, CampaignId: campaignId, CampaignName: campaignName,
                Category: "player_joined", Title: $"{targetDisplay} Joined {campaignName}",
                Message: $"{targetDisplay} (@{targetUsername}) accepted the campaign invite and joined {campaignName}{charLabel}.",
                RouteLink: "/home", ActionLabel: "View Party Roster", ActorName: targetDisplay,
                IsRead: false, CreatedAt: DateTimeOffset.UtcNow), ct);
        }
        catch { }

        return Results.Ok(new
        {
            campaignId, username = targetUsername, displayName = targetDisplay, email = targetEmail,
            inviteStatus = "active", assignedCharacterKey = charKey, assignedCharacterName = charName
        });
    }

    private static async Task<IResult> AssignCharacterToMemberAsync(
        int campaignId, AssignCharacterToMemberRequest req, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var charKey = req.CharacterKey?.Trim();
        if (string.IsNullOrWhiteSpace(charKey)) return Results.BadRequest(new { error = "CharacterKey is required." });
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await CampaignMembershipStore.EnsureSchemaAsync(db, ct);
            await using var clearCmd = new MySqlCommand(
                "UPDATE lw_campaign_members SET assigned_character_key = NULL WHERE campaign_id = @c AND assigned_character_key = @k", db);
            clearCmd.Parameters.AddWithValue("@c", campaignId);
            clearCmd.Parameters.AddWithValue("@k", charKey);
            await clearCmd.ExecuteNonQueryAsync(ct);

            var cleanUser = (req.PlayerUsername ?? string.Empty).Trim().TrimStart('@');
            var cleanEmail = (req.PlayerEmail ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(cleanEmail) || !string.IsNullOrWhiteSpace(cleanUser))
            {
                var (uid, canonicalEmail, canonicalUser, canonicalDisplay) =
                    await CampaignMembershipStore.ResolveUserIdentityAsync(db, cleanUser, cleanEmail, cleanUser, ct);
                await using var upsertCmd = new MySqlCommand("""
                    INSERT INTO lw_campaign_members
                        (campaign_id, user_id, auth_email, member_role, assigned_character_key, invite_status, player_username, player_display_name)
                    VALUES (@c, @uid, @e, 'player', @k, 'active', @u, @dn)
                    ON DUPLICATE KEY UPDATE
                        assigned_character_key = VALUES(assigned_character_key),
                        invite_status = 'active',
                        player_username = COALESCE(VALUES(player_username), player_username),
                        player_display_name = COALESCE(VALUES(player_display_name), player_display_name)
                    """, db);
                upsertCmd.Parameters.AddWithValue("@c", campaignId);
                upsertCmd.Parameters.AddWithValue("@uid", uid);
                upsertCmd.Parameters.AddWithValue("@e", canonicalEmail);
                upsertCmd.Parameters.AddWithValue("@k", charKey);
                upsertCmd.Parameters.AddWithValue("@u", canonicalUser);
                upsertCmd.Parameters.AddWithValue("@dn", canonicalDisplay);
                await upsertCmd.ExecuteNonQueryAsync(ct);
            }
        }
        catch { }
        return Results.Ok(new { campaignId, characterKey = charKey, playerUsername = req.PlayerUsername, playerAccountId = req.PlayerAccountId });
    }

    private static async Task<IResult> RemoveCharacterFromCampaignAsync(
        int campaignId, string characterKey, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var clearMember = new MySqlCommand(
                "UPDATE lw_campaign_members SET assigned_character_key = NULL WHERE campaign_id = @c AND assigned_character_key = @k", db);
            clearMember.Parameters.AddWithValue("@c", campaignId);
            clearMember.Parameters.AddWithValue("@k", characterKey);
            await clearMember.ExecuteNonQueryAsync(ct);

            await using var delChar = new MySqlCommand(
                "DELETE FROM lw_characters WHERE campaign_id = @c AND character_key = @k", db);
            delChar.Parameters.AddWithValue("@c", campaignId);
            delChar.Parameters.AddWithValue("@k", characterKey);
            await delChar.ExecuteNonQueryAsync(ct);
        }
        catch { }
        return Results.Ok(new { campaignId, characterKey, removed = true });
    }

    private static async Task<IResult> ListInvitesAsync(
        int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var (_, error) = await RequireGmAsync(ctx, campaignId, repo, ct);
        if (error is not null) return error;
        var list = new List<object>();
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand(
            "SELECT id, member_role, max_uses, use_count, expires_at, revoked_at, created_at FROM lw_campaign_invites WHERE campaign_id = @c ORDER BY id DESC", db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new
            {
                id = r.GetInt64(0), role = r.GetString(1), maxUses = r.GetInt32(2), useCount = r.GetInt32(3),
                expiresAt = r.IsDBNull(4) ? (DateTime?)null : r.GetDateTime(4), revoked = !r.IsDBNull(5), createdAt = r.GetDateTime(6)
            });
        }
        return Results.Ok(list);
    }

    private static async Task<IResult> RevokeInviteAsync(
        int campaignId, long inviteId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var (_, error) = await RequireGmAsync(ctx, campaignId, repo, ct);
        if (error is not null) return error;
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand(
            "UPDATE lw_campaign_invites SET revoked_at = UTC_TIMESTAMP() WHERE id = @i AND campaign_id = @c AND revoked_at IS NULL", db);
        cmd.Parameters.AddWithValue("@i", inviteId);
        cmd.Parameters.AddWithValue("@c", campaignId);
        return await cmd.ExecuteNonQueryAsync(ct) > 0 ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> RedeemInviteAsync(
        RedeemInviteRequest body, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Token) || body.Token.Length > 128)
            return Results.BadRequest(new { error = "An invite code is required." });

        await using var db = await repo.OpenConnectionAsync(ct);
        await CampaignMembershipStore.EnsureSchemaAsync(db, ct);
        await using var tx = await db.BeginTransactionAsync(ct);
        int campaignId;
        string role;
        await using (var find = new MySqlCommand("""
            SELECT campaign_id, member_role FROM lw_campaign_invites
            WHERE token_hash = @h AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) AND use_count < max_uses
            FOR UPDATE
            """, db, tx))
        {
            find.Parameters.AddWithValue("@h", HashToken(body.Token.Trim()));
            await using var r = await find.ExecuteReaderAsync(ct);
            if (!await r.ReadAsync(ct)) return Results.NotFound(new { error = "This invite is invalid, expired or used up." });
            campaignId = r.GetInt32(0);
            role = r.GetString(1);
        }

        var existing = await CampaignMembershipStore.FindAsync(repo, campaignId, user, ct);
        if (existing is null)
        {
            await using var add = new MySqlCommand("""
                INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role, invite_status, player_username, player_display_name)
                SELECT @c, u.id, @e, @r, 'pending', @un, @dn FROM lw_users u WHERE LOWER(u.email) = LOWER(@e) LIMIT 1
                """, db, tx);
            add.Parameters.AddWithValue("@c", campaignId);
            add.Parameters.AddWithValue("@e", user.Email.Trim());
            add.Parameters.AddWithValue("@r", role);
            add.Parameters.AddWithValue("@un", user.Username);
            add.Parameters.AddWithValue("@dn", user.DisplayName);
            if (await add.ExecuteNonQueryAsync(ct) != 1)
                return Results.Conflict(new { error = "Your account is not linked to the campaign identity store yet." });

            await using var bump = new MySqlCommand("UPDATE lw_campaign_invites SET use_count = use_count + 1 WHERE token_hash = @h", db, tx);
            bump.Parameters.AddWithValue("@h", HashToken(body.Token.Trim()));
            await bump.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return Results.Ok(new { campaignId, role = existing?.MemberRole ?? role, alreadyMember = existing is not null });
    }

    private static async Task<(StoredUserRecord? User, IResult? Error)> RequireGmAsync(
        HttpContext ctx, int campaignId, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var user = AuthAndCheckoutEndpoints.ResolveAuthenticatedUser(ctx);
        if (user is null) return (null, Results.Unauthorized());
        var membership = await CampaignMembershipStore.FindAsync(repo, campaignId, user, ct);
        return membership is { IsGm: true } ? (user, null) : (null, Results.Forbid());
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Slugify(string name)
    {
        var slug = NonSlugChars().Replace(name.ToLowerInvariant(), "-").Trim('-');
        return slug.Length == 0 ? "campaign" : slug[..Math.Min(slug.Length, 48)];
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugChars();
}
