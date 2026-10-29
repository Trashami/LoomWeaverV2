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

/// <summary>Real campaign creation, invite token issuing and redemption (replaces the constant invite code).</summary>
public static partial class CampaignInviteEndpoints
{
    private static readonly string[] SystemCodes = ["dnd5e", "pf2e", "vampire_v5"];

    public static RouteGroupBuilder MapCampaignInviteEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/campaigns", CreateCampaignAsync);
        api.MapPost("/campaigns/{campaignId:int}/invites", CreateInviteAsync);
        api.MapGet("/campaigns/{campaignId:int}/invites", ListInvitesAsync);
        api.MapDelete("/campaigns/{campaignId:int}/invites/{inviteId:long}", RevokeInviteAsync);
        api.MapPost("/invites/redeem", RedeemInviteAsync);
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
            INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role)
            SELECT @c, u.id, @e, 'gm' FROM lw_users u WHERE LOWER(u.email) = LOWER(@e) LIMIT 1
            """, db, tx);
        member.Parameters.AddWithValue("@c", campaignId);
        member.Parameters.AddWithValue("@e", user.Email.Trim());
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
        var maxUses = Math.Clamp(body?.MaxUses ?? 10, 1, 100);
        var days = Math.Clamp(body?.ExpiresInDays ?? 14, 1, 90);
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24))
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

        // The raw token is only ever returned here; only its hash is stored.
        return Results.Ok(new
        {
            id = cmd.LastInsertedId,
            campaignId,
            role,
            maxUses,
            expiresInDays = days,
            inviteCode = token,
            inviteUrl = $"https://loom-weaver.com/campaigns?join={token}"
        });
    }

    private static async Task<IResult> ListInvitesAsync(
        int campaignId, HttpContext ctx, LoomWeaverMySqlRepository repo, CancellationToken ct)
    {
        var (_, error) = await RequireGmAsync(ctx, campaignId, repo, ct);
        if (error is not null) return error;

        var list = new List<object>();
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT id, member_role, max_uses, use_count, expires_at, revoked_at, created_at
            FROM lw_campaign_invites WHERE campaign_id = @c ORDER BY id DESC
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new
            {
                id = r.GetInt64(0),
                role = r.GetString(1),
                maxUses = r.GetInt32(2),
                useCount = r.GetInt32(3),
                expiresAt = r.IsDBNull(4) ? (DateTime?)null : r.GetDateTime(4),
                revoked = !r.IsDBNull(5),
                createdAt = r.GetDateTime(6)
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
        await using var tx = await db.BeginTransactionAsync(ct);
        int campaignId;
        string role;
        await using (var find = new MySqlCommand("""
            SELECT campaign_id, member_role FROM lw_campaign_invites
            WHERE token_hash = @h AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())
              AND use_count < max_uses
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
                INSERT INTO lw_campaign_members (campaign_id, user_id, auth_email, member_role)
                SELECT @c, u.id, @e, @r FROM lw_users u WHERE LOWER(u.email) = LOWER(@e) LIMIT 1
                """, db, tx);
            add.Parameters.AddWithValue("@c", campaignId);
            add.Parameters.AddWithValue("@e", user.Email.Trim());
            add.Parameters.AddWithValue("@r", role);
            if (await add.ExecuteNonQueryAsync(ct) != 1)
                return Results.Conflict(new { error = "Your account is not linked to the campaign identity store yet." });

            await using var bump = new MySqlCommand(
                "UPDATE lw_campaign_invites SET use_count = use_count + 1 WHERE token_hash = @h", db, tx);
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
