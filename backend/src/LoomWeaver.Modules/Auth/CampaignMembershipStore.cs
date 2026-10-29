using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Auth;

/// <summary>A user's seat in one campaign, read from the canonical lw_campaign_members table.</summary>
public sealed record CampaignMembership(
    int CampaignId,
    string MemberRole,
    string? CharacterKey,
    string? CharacterName,
    long? CharacterId)
{
    public bool IsGm => string.Equals(MemberRole, "gm", StringComparison.OrdinalIgnoreCase);
}

public sealed record CampaignMemberRow(
    long UserId,
    string Email,
    string MemberRole,
    string? CharacterKey,
    string? CharacterName,
    long? CharacterId);

/// <summary>
/// Single source of truth for campaign membership (loomweaver.lw_campaign_members).
/// Members are matched by authenticated email, which is stable across the legacy
/// jane_scrum.mw_users and loomweaver.lw_auth_users identity tables.
/// Every lookup fails closed: database errors mean "not a member".
/// </summary>
public static class CampaignMembershipStore
{
    private const string Columns =
        "campaign_id, member_role, assigned_character_key";

    public static async Task<CampaignMembership?> FindAsync(
        LoomWeaverMySqlRepository repo, int campaignId, StoredUserRecord user, CancellationToken ct = default)
    {
        if (campaignId <= 0 || string.IsNullOrWhiteSpace(user.Email)) return null;
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand($"""
                SELECT {Columns} FROM lw_campaign_members
                WHERE campaign_id = @c AND auth_email = @e
                ORDER BY FIELD(member_role, 'gm', 'player', 'spectator') LIMIT 1
                """, db);
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@e", user.Email.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            return await r.ReadAsync(ct) ? Read(r) : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Console.Error.WriteLine($"[LoomWeaver] Membership lookup failed for campaign {campaignId}: {ex.Message}");
            return null;
        }
    }

    public static async Task<IReadOnlyList<CampaignMembership>> ListForUserAsync(
        LoomWeaverMySqlRepository repo, StoredUserRecord user, CancellationToken ct = default)
    {
        var list = new List<CampaignMembership>();
        if (string.IsNullOrWhiteSpace(user.Email)) return list;
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand($"""
                SELECT {Columns} FROM lw_campaign_members
                WHERE auth_email = @e
                ORDER BY campaign_id, FIELD(member_role, 'gm', 'player', 'spectator')
                """, db);
            cmd.Parameters.AddWithValue("@e", user.Email.Trim());
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
            {
                var m = Read(r);
                if (list.All(x => x.CampaignId != m.CampaignId)) list.Add(m);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            Console.Error.WriteLine($"[LoomWeaver] Membership list failed: {ex.Message}");
        }
        return list;
    }

    public static async Task<IReadOnlyList<CampaignMemberRow>> ListMembersAsync(
        LoomWeaverMySqlRepository repo, int campaignId, CancellationToken ct = default)
    {
        var list = new List<CampaignMemberRow>();
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            SELECT user_id, auth_email, member_role, assigned_character_key
            FROM lw_campaign_members WHERE campaign_id = @c
            ORDER BY FIELD(member_role, 'gm', 'player', 'spectator'), auth_email
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new CampaignMemberRow(
                r.GetInt64(0), r.GetString(1), r.GetString(2),
                r.IsDBNull(3) ? null : r.GetString(3),
                null,
                null));
        }
        return list;
    }

    /// <summary>Adds (or re-roles) a member. Used when a GM creates a campaign or a player joins.</summary>
    public static async Task UpsertAsync(
        LoomWeaverMySqlRepository repo, int campaignId, StoredUserRecord user, string memberRole,
        string? characterKey = null, string? characterName = null, CancellationToken ct = default)
    {
        var role = memberRole is "gm" or "spectator" ? memberRole : "player";
        await using var db = await repo.OpenConnectionAsync(ct);
        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_campaign_members
                (campaign_id, user_id, auth_email, member_role, assigned_character_key)
            VALUES (@c, @u, @e, @r, @k)
            ON DUPLICATE KEY UPDATE member_role = VALUES(member_role),
                assigned_character_key = COALESCE(VALUES(assigned_character_key), assigned_character_key)
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@u", user.Id);
        cmd.Parameters.AddWithValue("@e", user.Email.Trim());
        cmd.Parameters.AddWithValue("@r", role);
        cmd.Parameters.AddWithValue("@k", (object?)characterKey ?? DBNull.Value);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static CampaignMembership Read(MySqlDataReader r) => new(
        r.GetInt32(0),
        r.GetString(1),
        r.IsDBNull(2) ? null : r.GetString(2),
        null,
        null);
}
