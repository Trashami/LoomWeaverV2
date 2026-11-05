using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Auth;

/// <summary>A user's seat in one campaign, read from the canonical lw_campaign_members table.</summary>
public sealed record CampaignMembership(
    int CampaignId,
    string MemberRole,
    string? CharacterKey,
    string? CharacterName,
    long? CharacterId,
    string InviteStatus = "active",
    string? Username = null,
    string? DisplayName = null)
{
    public bool IsGm => string.Equals(MemberRole, "gm", StringComparison.OrdinalIgnoreCase);
}

public sealed record CampaignMemberRow(
    long Id,
    long UserId,
    string Email,
    string MemberRole,
    string? CharacterKey,
    string? CharacterName,
    long? CharacterId,
    string InviteStatus = "active",
    string? Username = null,
    string? DisplayName = null);

/// <summary>
/// Single source of truth for campaign membership (loomweaver.lw_campaign_members).
/// Members are matched by authenticated email OR username (supporting players invited by username before email resolution).
/// Every lookup fails closed: database errors mean "not a member".
/// </summary>
public static class CampaignMembershipStore
{
    private static volatile bool _schemaEnsured;

    public static async Task EnsureSchemaAsync(MySqlConnection db, CancellationToken ct = default)
    {
        if (_schemaEnsured) return;
        var alters = new[]
        {
            "ALTER TABLE lw_campaign_members ADD COLUMN invite_status VARCHAR(32) NOT NULL DEFAULT 'active'",
            "ALTER TABLE lw_campaign_members ADD COLUMN player_username VARCHAR(64) NULL",
            "ALTER TABLE lw_campaign_members ADD COLUMN player_display_name VARCHAR(128) NULL",
            "ALTER TABLE lw_campaign_members ADD COLUMN character_name VARCHAR(128) NULL"
        };
        foreach (var sql in alters)
        {
            try
            {
                await using var cmd = new MySqlCommand(sql, db);
                await cmd.ExecuteNonQueryAsync(ct);
            }
            catch
            {
                // Column already exists or table does not support alter; ignore safely.
            }
        }
        _schemaEnsured = true;
    }

    public static async Task<(long CanonicalUserId, string CanonicalEmail, string CanonicalUsername, string CanonicalDisplayName)> ResolveUserIdentityAsync(
        MySqlConnection db, string? username, string? email, string? displayName, CancellationToken ct = default)
    {
        var cleanUser = (username ?? string.Empty).Trim().TrimStart('@');
        var cleanEmail = (email ?? string.Empty).Trim();
        var cleanDisplay = (displayName ?? string.Empty).Trim();

        // 1. Check lw_auth_users by username or email
        if (!string.IsNullOrWhiteSpace(cleanUser) || !string.IsNullOrWhiteSpace(cleanEmail))
        {
            try
            {
                await using var authCmd = new MySqlCommand("""
                    SELECT username, email, display_name
                    FROM lw_auth_users
                    WHERE (@u <> '' AND LOWER(username) = LOWER(@u))
                       OR (@e <> '' AND LOWER(email) = LOWER(@e))
                       OR (@u <> '' AND LOWER(display_name) = LOWER(@u))
                    ORDER BY CASE WHEN @u <> '' AND LOWER(username) = LOWER(@u) THEN 0 ELSE 1 END
                    LIMIT 1
                    """, db);
                authCmd.Parameters.AddWithValue("@u", cleanUser);
                authCmd.Parameters.AddWithValue("@e", cleanEmail);
                await using var r = await authCmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    cleanUser = r.GetString(0);
                    cleanEmail = r.GetString(1);
                    if (string.IsNullOrWhiteSpace(cleanDisplay))
                        cleanDisplay = r.GetString(2);
                }
            }
            catch { }
        }

        // 2. Check lw_users for canonical user_id (and ensure row exists if email is known)
        long canonicalUserId = 1;
        try
        {
            if (!string.IsNullOrWhiteSpace(cleanEmail))
            {
                await using var ensureUserCmd = new MySqlCommand("""
                    INSERT INTO lw_users (username, email, display_name)
                    SELECT @u, @e, @dn FROM DUAL
                    WHERE NOT EXISTS (SELECT 1 FROM lw_users WHERE LOWER(email) = LOWER(@e) OR LOWER(username) = LOWER(@u))
                    """, db);
                ensureUserCmd.Parameters.AddWithValue("@u", string.IsNullOrWhiteSpace(cleanUser) ? cleanEmail.Split('@')[0] : cleanUser);
                ensureUserCmd.Parameters.AddWithValue("@e", cleanEmail);
                ensureUserCmd.Parameters.AddWithValue("@dn", string.IsNullOrWhiteSpace(cleanDisplay) ? cleanUser : cleanDisplay);
                await ensureUserCmd.ExecuteNonQueryAsync(ct);
            }

            await using var uCmd = new MySqlCommand("""
                SELECT id, email, display_name
                FROM lw_users
                WHERE (@e <> '' AND LOWER(email) = LOWER(@e))
                   OR (@u <> '' AND LOWER(SUBSTRING_INDEX(email, '@', 1)) = LOWER(@u))
                   OR (@u <> '' AND LOWER(display_name) = LOWER(@u))
                ORDER BY CASE WHEN @e <> '' AND LOWER(email) = LOWER(@e) THEN 0 ELSE 1 END
                LIMIT 1
                """, db);
            uCmd.Parameters.AddWithValue("@e", cleanEmail);
            uCmd.Parameters.AddWithValue("@u", cleanUser);
            await using var r = await uCmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                canonicalUserId = r.GetInt64(0);
                if (string.IsNullOrWhiteSpace(cleanEmail) || cleanEmail.EndsWith("@loom-weaver.com", StringComparison.OrdinalIgnoreCase))
                    cleanEmail = r.GetString(1);
                if (string.IsNullOrWhiteSpace(cleanDisplay) && !r.IsDBNull(2))
                    cleanDisplay = r.GetString(2);
            }
        }
        catch { }

        if (string.IsNullOrWhiteSpace(cleanUser))
            cleanUser = !string.IsNullOrWhiteSpace(cleanEmail) ? cleanEmail.Split('@')[0] : "player";
        if (string.IsNullOrWhiteSpace(cleanEmail))
            cleanEmail = $"{cleanUser.ToLowerInvariant()}@loom-weaver.com";
        if (string.IsNullOrWhiteSpace(cleanDisplay))
            cleanDisplay = cleanUser;

        return (canonicalUserId, cleanEmail, cleanUser, cleanDisplay);
    }

    public static async Task<CampaignMembership?> FindAsync(
        LoomWeaverMySqlRepository repo, int campaignId, StoredUserRecord user, CancellationToken ct = default)
    {
        if (campaignId <= 0 || (string.IsNullOrWhiteSpace(user.Email) && string.IsNullOrWhiteSpace(user.Username))) return null;
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureSchemaAsync(db, ct);
            await HealUserEmailLinksAsync(db, user, ct);

            await using var cmd = new MySqlCommand("""
                SELECT campaign_id, member_role, assigned_character_key, character_name, invite_status, player_username, player_display_name
                FROM lw_campaign_members
                WHERE campaign_id = @c
                  AND (
                    LOWER(auth_email) = LOWER(@e)
                    OR (@u <> '' AND LOWER(auth_email) = LOWER(@synth))
                    OR (@u <> '' AND LOWER(COALESCE(player_username, '')) = LOWER(@u))
                    OR (@u <> '' AND LOWER(SUBSTRING_INDEX(auth_email, '@', 1)) = LOWER(@u))
                  )
                ORDER BY FIELD(member_role, 'gm', 'player', 'spectator') LIMIT 1
                """, db);
            var cleanU = (user.Username ?? string.Empty).Trim().TrimStart('@');
            cmd.Parameters.AddWithValue("@c", campaignId);
            cmd.Parameters.AddWithValue("@e", (user.Email ?? string.Empty).Trim());
            cmd.Parameters.AddWithValue("@u", cleanU);
            cmd.Parameters.AddWithValue("@synth", $"{cleanU.ToLowerInvariant()}@loom-weaver.com");
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
        if (string.IsNullOrWhiteSpace(user.Email) && string.IsNullOrWhiteSpace(user.Username)) return list;
        try
        {
            await using var db = await repo.OpenConnectionAsync(ct);
            await EnsureSchemaAsync(db, ct);
            await HealUserEmailLinksAsync(db, user, ct);

            var cleanU = (user.Username ?? string.Empty).Trim().TrimStart('@');
            await using var cmd = new MySqlCommand("""
                SELECT campaign_id, member_role, assigned_character_key, character_name, invite_status, player_username, player_display_name
                FROM lw_campaign_members
                WHERE LOWER(auth_email) = LOWER(@e)
                   OR (@u <> '' AND LOWER(auth_email) = LOWER(@synth))
                   OR (@u <> '' AND LOWER(COALESCE(player_username, '')) = LOWER(@u))
                   OR (@u <> '' AND LOWER(SUBSTRING_INDEX(auth_email, '@', 1)) = LOWER(@u))
                ORDER BY campaign_id, FIELD(member_role, 'gm', 'player', 'spectator')
                """, db);
            cmd.Parameters.AddWithValue("@e", (user.Email ?? string.Empty).Trim());
            cmd.Parameters.AddWithValue("@u", cleanU);
            cmd.Parameters.AddWithValue("@synth", $"{cleanU.ToLowerInvariant()}@loom-weaver.com");
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
        await EnsureSchemaAsync(db, ct);

        await using var cmd = new MySqlCommand("""
            SELECT
                m.id,
                m.user_id,
                m.auth_email,
                m.member_role,
                m.assigned_character_key,
                COALESCE(m.character_name, c.name) AS resolved_char_name,
                COALESCE(m.invite_status, 'active') AS resolved_status,
                COALESCE(m.player_username, au.username, SUBSTRING_INDEX(m.auth_email, '@', 1)) AS resolved_username,
                COALESCE(m.player_display_name, au.display_name, u.display_name, SUBSTRING_INDEX(m.auth_email, '@', 1)) AS resolved_display
            FROM lw_campaign_members m
            LEFT JOIN lw_auth_users au ON LOWER(au.email) = LOWER(m.auth_email)
                OR LOWER(au.username) = LOWER(COALESCE(m.player_username, SUBSTRING_INDEX(m.auth_email, '@', 1)))
            LEFT JOIN lw_users u ON u.id = m.user_id
            LEFT JOIN lw_characters c ON c.campaign_id = m.campaign_id AND c.character_key = m.assigned_character_key
            WHERE m.campaign_id = @c
            ORDER BY FIELD(m.member_role, 'gm', 'player', 'spectator'), m.id
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new CampaignMemberRow(
                r.GetInt64(0),
                r.GetInt64(1),
                r.GetString(2),
                r.GetString(3),
                r.IsDBNull(4) ? null : r.GetString(4),
                r.IsDBNull(5) ? null : r.GetString(5),
                null,
                r.IsDBNull(6) ? "active" : r.GetString(6),
                r.IsDBNull(7) ? null : r.GetString(7),
                r.IsDBNull(8) ? null : r.GetString(8)));
        }
        return list;
    }

    /// <summary>Adds (or re-roles) a member. Used when a GM creates a campaign or a player joins.</summary>
    public static async Task UpsertAsync(
        LoomWeaverMySqlRepository repo, int campaignId, StoredUserRecord user, string memberRole,
        string? characterKey = null, string? characterName = null, string inviteStatus = "active", CancellationToken ct = default)
    {
        var role = memberRole is "gm" or "spectator" ? memberRole : "player";
        await using var db = await repo.OpenConnectionAsync(ct);
        await EnsureSchemaAsync(db, ct);

        var (canonicalUserId, canonicalEmail, canonicalUsername, canonicalDisplay) =
            await ResolveUserIdentityAsync(db, user.Username, user.Email, user.DisplayName, ct);

        await using var cmd = new MySqlCommand("""
            INSERT INTO lw_campaign_members
                (campaign_id, user_id, auth_email, member_role, assigned_character_key, character_name, invite_status, player_username, player_display_name)
            VALUES (@c, @u, @e, @r, @k, @cn, @st, @un, @dn)
            ON DUPLICATE KEY UPDATE
                member_role = VALUES(member_role),
                assigned_character_key = COALESCE(VALUES(assigned_character_key), assigned_character_key),
                character_name = COALESCE(VALUES(character_name), character_name),
                invite_status = VALUES(invite_status),
                player_username = COALESCE(VALUES(player_username), player_username),
                player_display_name = COALESCE(VALUES(player_display_name), player_display_name)
            """, db);
        cmd.Parameters.AddWithValue("@c", campaignId);
        cmd.Parameters.AddWithValue("@u", canonicalUserId);
        cmd.Parameters.AddWithValue("@e", canonicalEmail);
        cmd.Parameters.AddWithValue("@r", role);
        cmd.Parameters.AddWithValue("@k", (object?)characterKey ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cn", (object?)characterName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@st", inviteStatus);
        cmd.Parameters.AddWithValue("@un", canonicalUsername);
        cmd.Parameters.AddWithValue("@dn", canonicalDisplay);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task HealUserEmailLinksAsync(MySqlConnection db, StoredUserRecord user, CancellationToken ct)
    {
        var cleanU = (user.Username ?? string.Empty).Trim().TrimStart('@');
        var cleanE = (user.Email ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(cleanU) || string.IsNullOrWhiteSpace(cleanE)) return;
        try
        {
            await using var cmd = new MySqlCommand("""
                UPDATE lw_campaign_members
                SET auth_email = @e,
                    player_username = COALESCE(player_username, @u),
                    player_display_name = COALESCE(player_display_name, @dn),
                    invite_status = CASE
                        WHEN member_role <> 'gm' AND assigned_character_key IS NULL AND invite_status = 'active' THEN 'pending'
                        ELSE invite_status
                    END
                WHERE (LOWER(auth_email) = LOWER(@synth) OR LOWER(COALESCE(player_username, '')) = LOWER(@u))
                  AND LOWER(auth_email) <> LOWER(@e)
                """, db);
            cmd.Parameters.AddWithValue("@e", cleanE);
            cmd.Parameters.AddWithValue("@u", cleanU);
            cmd.Parameters.AddWithValue("@dn", string.IsNullOrWhiteSpace(user.DisplayName) ? cleanU : user.DisplayName.Trim());
            cmd.Parameters.AddWithValue("@synth", $"{cleanU.ToLowerInvariant()}@loom-weaver.com");
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch { }
    }

    private static CampaignMembership Read(MySqlDataReader r) => new(
        r.GetInt32(0),
        r.GetString(1),
        r.IsDBNull(2) ? null : r.GetString(2),
        r.IsDBNull(3) ? null : r.GetString(3),
        null,
        r.IsDBNull(4) ? "active" : r.GetString(4),
        r.IsDBNull(5) ? null : r.GetString(5),
        r.IsDBNull(6) ? null : r.GetString(6));
}
