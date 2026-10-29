using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LoomWeaver.Domain;
using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Auth;

public sealed record StoredUserRecord(
    long Id,
    string AccountId,
    string Email,
    string Username,
    string DisplayName,
    string PasswordHash,
    string PasswordSalt,
    string Role,
    string TierCode,
    string BoundCharacter,
    IReadOnlyList<string> OwnedAssetIds,
    double CreatorBalanceUsd
);

public static class MySqlUserAuthStore
{
    private const string GoogleClientId =
        "280529007750-q5jrb7qbln2hpcaf8a62j4125oied8qs.apps.googleusercontent.com";

    private static readonly List<StoredUserRecord> MemoryUsers = BuildSeedUsers();
    private static bool _schemaInitialized;

    private static List<StoredUserRecord> BuildSeedUsers()
    {
        // Seed profiles are used only to decode legacy session claims; they are never login credentials.
        var (adminHash, adminSalt) = PasswordHasher.HashPassword(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)));
        var (testerHash, testerSalt) = PasswordHasher.HashPassword(Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)));

        return new List<StoredUserRecord>
        {
            new(1, "acc-gm-geojason", "jtromborg1@gmail.com", "GeoJason", "Jason (GeoJason)", adminHash, adminSalt, "gm", "legendary", "GM",
                new[] { "asset-map-cinth", "asset-dice-runed-obsidian", "mod-cinth-masquerade-pack", "mod-shadow-mountain-raid" }, 1842.50),
            new(2, "acc-gm-trashami", "gm@loom-weaver.com", "trashami", "Trashami · Master GM & Creator", adminHash, adminSalt, "gm", "legendary", "GM",
                new[] { "asset-map-cinth", "asset-dice-runed-obsidian", "mod-cinth-masquerade-pack", "mod-shadow-mountain-raid" }, 1842.50),
            new(3, "acc-player-dal", "scott.brogan@loomweaver.com", "ScottBrogan", "Scott Brogan (Dal Riata)", testerHash, testerSalt, "gm", "legendary", "Dal",
                new[] { "asset-map-cinth" }, 0.00),
            new(4, "acc-player-kycius", "stick.hazen@loomweaver.com", "StickHazen", "Stick Hazen (Kycius)", testerHash, testerSalt, "gm", "worldsmith", "Kycius",
                Array.Empty<string>(), 0.00),
            new(4522, "acc-gm-greg", "gregmeinert@loomweaver.com", "GregMeinert", "Greg Meinert", testerHash, testerSalt, "gm", "legendary", "GM",
                new[] { "asset-map-cinth", "asset-dice-runed-obsidian" }, 0.00),
            new(5359, "acc-player-kildrid", "ryan.issak@loomweaver.com", "RyanIssak", "Ryan Issak (Kildrid)", testerHash, testerSalt, "players", "worldsmith", "Kildrid",
                Array.Empty<string>(), 0.00),
            new(5360, "acc-player-fivi", "dallas.crow@loomweaver.com", "DallasCrow", "Dallas Crow (Fivi)", testerHash, testerSalt, "players", "adventurer", "Fivi",
                new[] { "asset-dice-runed-obsidian" }, 0.00),
            new(5362, "acc-player-munk", "pete.higano@loomweaver.com", "PeteHigano", "Pete Higano (Munk)", testerHash, testerSalt, "players", "adventurer", "Munk",
                Array.Empty<string>(), 0.00),
            new(5361, "acc-player-josh", "josh.tromborg@loomweaver.com", "JoshTromborg", "Josh Tromborg", testerHash, testerSalt, "players", "worldsmith", "Dal",
                Array.Empty<string>(), 0.00),
            new(5363, "acc-gm-kenneth", "kenneth.alexander@loomweaver.com", "KennethAlexander", "Kenneth Alexander", testerHash, testerSalt, "gm", "legendary", "GM",
                Array.Empty<string>(), 0.00),
            new(5364, "acc-player-christine", "christine.richey@loomweaver.com", "ChristineRichey", "Christine Richey", testerHash, testerSalt, "players", "worldsmith", "Fivi",
                Array.Empty<string>(), 0.00),
            new(5365, "acc-player-michael", "michael.aguilar@loomweaver.com", "MichaelAguilar", "Michael Aguilar", testerHash, testerSalt, "players", "adventurer", "Kycius",
                Array.Empty<string>(), 0.00),
            new(5366, "acc-player-juno", "juno@loomweaver.com", "Juno", "Juno", testerHash, testerSalt, "players", "worldsmith", "Fivi",
                Array.Empty<string>(), 0.00),
            new(5367, "acc-player-candice", "candice.freymond@loomweaver.com", "CandiceFreymond", "Candice Freymond", testerHash, testerSalt, "players", "adventurer", "Dal",
                Array.Empty<string>(), 0.00)
        };
    }

    public static UserAccountProfileContract ToContract(StoredUserRecord u) =>
        new(u.AccountId, u.Username, u.DisplayName, u.Email, u.Role, u.TierCode, u.BoundCharacter, u.OwnedAssetIds, u.CreatorBalanceUsd);

    public static object ToLegacyUserDto(StoredUserRecord u, string? freshToken = null)
    {
        var isAdmin = string.Equals(u.Role, "admin", StringComparison.OrdinalIgnoreCase);
        return new
        {
            id = u.Id,
            accountId = u.AccountId,
            email = u.Email,
            username = u.Username,
            displayName = u.DisplayName,
            role = isAdmin ? "admin" : (u.Role == "gm" ? "dm" : "player"),
            tier = u.TierCode,
            billingCycle = "annual",
            subscriptionStatus = "active",
            subscriptionAiCredits = 1000,
            purchasedAiCredits = 500,
            totalAiCredits = 1500,
            storageUsedBytes = 0L,
            storageLimitBytes = 10737418240L,
            activeCampaignsLimit = 25,
            isAdmin,
            boundCharacter = u.BoundCharacter,
            token = freshToken ?? IssueHmacJwt(u, DateTimeOffset.UtcNow.AddDays(30))
        };
    }

    public static async Task EnsureDatabaseReadyAsync(LoomWeaverMySqlRepository repo, CancellationToken ct = default)
    {
        if (_schemaInitialized) return;
        try
        {
            await using var conn = await repo.OpenConnectionAsync(ct);

            const string createSql = """
                CREATE TABLE IF NOT EXISTS lw_auth_users (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    account_id VARCHAR(64) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    username VARCHAR(64) NOT NULL UNIQUE,
                    display_name VARCHAR(128) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    password_salt VARCHAR(255) NOT NULL,
                    google_id VARCHAR(128) NULL,
                    role VARCHAR(32) NOT NULL DEFAULT 'gm',
                    tier VARCHAR(32) NOT NULL DEFAULT 'adventurer',
                    bound_character VARCHAR(64) NOT NULL DEFAULT 'GM',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_login_at DATETIME NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                CREATE TABLE IF NOT EXISTS lw_account_requests (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    username VARCHAR(64) NOT NULL,
                    display_name VARCHAR(128) NOT NULL,
                    notes TEXT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'pending',
                    requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                """;
            await using (var cmd = new MySqlCommand(createSql, conn))
            {
                await cmd.ExecuteNonQueryAsync(ct);
            }

            _schemaInitialized = true;
        }
        catch
        {
            // Uses MemoryUsers when MySQL is unavailable locally
        }
    }

    public static async Task<StoredUserRecord?> AuthenticateAsync(
        LoomWeaverMySqlRepository repo,
        string identifier,
        string password,
        CancellationToken ct = default)
    {
        var cleanId = (identifier ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(cleanId) || string.IsNullOrWhiteSpace(password))
        {
            return null;
        }

        await EnsureDatabaseReadyAsync(repo, ct);

        await using var conn = await repo.OpenConnectionAsync(ct);
        const string sql = """
            SELECT id, COALESCE(account_id, CONCAT('acc-', id)), email, username, display_name,
                   password_hash, password_salt, role, tier, COALESCE(bound_character, 'GM')
            FROM lw_auth_users
            WHERE LOWER(email) = LOWER(@id) OR LOWER(username) = LOWER(@id) OR LOWER(account_id) = LOWER(@id)
            LIMIT 1;
            """;
        await using var cmd = new MySqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@id", cleanId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;

        var hash = reader.IsDBNull(5) ? string.Empty : reader.GetString(5);
        var salt = reader.IsDBNull(6) ? string.Empty : reader.GetString(6);
        if (!PasswordHasher.VerifyPassword(password, hash, salt)) return null;
        var rawRole = reader.GetString(7);
        var normalizedRole = rawRole is "player" or "players" ? "players" : "gm";
        return new StoredUserRecord(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            hash,
            salt,
            normalizedRole,
            reader.GetString(8),
            reader.GetString(9),
            Array.Empty<string>(),
            0.0);
    }

    public static async Task<StoredUserRecord> RegisterAsync(
        LoomWeaverMySqlRepository repo,
        string email,
        string username,
        string displayName,
        string password,
        CancellationToken ct = default)
    {
        await EnsureDatabaseReadyAsync(repo, ct);
        var cleanEmail = email.Trim().ToLowerInvariant();
        var cleanUser = string.IsNullOrWhiteSpace(username) ? cleanEmail.Split('@')[0] : username.Trim();
        var cleanDisplay = string.IsNullOrWhiteSpace(displayName) ? cleanUser : displayName.Trim();
        var (hash, salt) = PasswordHasher.HashPassword(password);
        var accountId = $"acc-player-{Guid.NewGuid():N}"[..18];
        long newId;

        try
        {
            await using var conn = await repo.OpenConnectionAsync(ct);
            await using var tx = await conn.BeginTransactionAsync(ct);
            await using (var insert = new MySqlCommand("""
                INSERT INTO lw_auth_users (account_id, email, username, display_name, password_hash, password_salt, role, tier, bound_character)
                VALUES (@aid, @email, @uname, @dname, @hash, @salt, 'players', 'adventurer', 'none')
                """, conn, tx))
            {
                insert.Parameters.AddWithValue("@aid", accountId);
                insert.Parameters.AddWithValue("@email", cleanEmail);
                insert.Parameters.AddWithValue("@uname", cleanUser);
                insert.Parameters.AddWithValue("@dname", cleanDisplay);
                insert.Parameters.AddWithValue("@hash", hash);
                insert.Parameters.AddWithValue("@salt", salt);
                await insert.ExecuteNonQueryAsync(ct);
                newId = insert.LastInsertedId;
            }

            await using (var canonical = new MySqlCommand("""
                INSERT INTO lw_users (email, username, display_name, role, tier_code)
                VALUES (@email, @uname, @dname, 'player', 'adventurer')
                ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)
                """, conn, tx))
            {
                canonical.Parameters.AddWithValue("@email", cleanEmail);
                canonical.Parameters.AddWithValue("@uname", cleanUser);
                canonical.Parameters.AddWithValue("@dname", cleanDisplay);
                await canonical.ExecuteNonQueryAsync(ct);
            }
            await tx.CommitAsync(ct);
        }
        catch (MySqlException ex) when (ex.Number == 1062)
        {
            throw new InvalidOperationException("An account with that email or username already exists.");
        }

        var record = new StoredUserRecord(
            newId, accountId, cleanEmail, cleanUser, cleanDisplay, hash, salt,
            "players", "adventurer", "none", Array.Empty<string>(), 0.0);
        MemoryUsers.Insert(0, record);
        return record;
    }

    public static async Task<StoredUserRecord?> AuthenticateGoogleTokenAsync(
        LoomWeaverMySqlRepository repo,
        string idToken,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(idToken)) return null;
        await EnsureDatabaseReadyAsync(repo, ct);

        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            var resp = await http.GetAsync($"https://oauth2.googleapis.com/tokeninfo?id_token={Uri.EscapeDataString(idToken)}", ct);
            if (!resp.IsSuccessStatusCode) return null;

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            var aud = root.TryGetProperty("aud", out var audProp) ? audProp.GetString() : null;
            if (!string.Equals(aud, GoogleClientId, StringComparison.Ordinal)) return null;

            var email = (root.TryGetProperty("email", out var emProp) ? emProp.GetString() : null)?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email)) return null;
            var name = (root.TryGetProperty("name", out var nmProp) ? nmProp.GetString() : null) ?? email.Split('@')[0];

            var verified = root.TryGetProperty("email_verified", out var verifiedProp) &&
                           verifiedProp.ValueKind == JsonValueKind.True;
            if (!verified) return null;

            await using var conn = await repo.OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand("""
                SELECT id, account_id, email, username, display_name, password_hash, password_salt,
                       role, tier, COALESCE(bound_character, 'none')
                FROM lw_auth_users WHERE LOWER(email) = LOWER(@email) LIMIT 1
                """, conn);
            cmd.Parameters.AddWithValue("@email", email);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            if (await r.ReadAsync(ct))
            {
                var rawRole = r.GetString(7);
                return new StoredUserRecord(
                    r.GetInt64(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetString(4),
                    r.GetString(5), r.GetString(6),
                    rawRole is "player" or "players" ? "players" : "gm",
                    r.GetString(8), r.GetString(9), Array.Empty<string>(), 0.0);
            }
            await r.DisposeAsync();

            return await RegisterAsync(repo, email, email.Split('@')[0], name,
                Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), ct);
        }
        catch
        {
            return null;
        }
    }

    public static string IssueHmacJwt(StoredUserRecord user, DateTimeOffset expiresAt) =>
        JwtTokenHelper.IssueHmacJwt(user, expiresAt);

    public static StoredUserRecord? VerifyHmacJwt(string? token) =>
        JwtTokenHelper.VerifyHmacJwt(token, MemoryUsers);
}
