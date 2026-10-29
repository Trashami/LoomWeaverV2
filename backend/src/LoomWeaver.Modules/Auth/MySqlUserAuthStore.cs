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
        // Seed profiles carry display metadata only. Their password hashes are random and
        // unknowable: real credentials live in jane_scrum.mw_users / lw_auth_users.
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

    public static IReadOnlyList<UserAccountProfileContract> GetPublicAccounts() =>
        MemoryUsers.Select(ToContract).ToList();

    public static UserAccountProfileContract ToContract(StoredUserRecord u) =>
        new(u.AccountId, u.Username, u.DisplayName, u.Email, u.Role, u.TierCode, u.BoundCharacter, u.OwnedAssetIds, u.CreatorBalanceUsd);

    public static object ToLegacyUserDto(StoredUserRecord u, string? freshToken = null)
    {
        var isAdmin = u.Email.Equals("jtromborg1@gmail.com", StringComparison.OrdinalIgnoreCase) ||
                      u.Username.Equals("GeoJason", StringComparison.OrdinalIgnoreCase) ||
                      u.Username.Equals("GregMeinert", StringComparison.OrdinalIgnoreCase);
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

            foreach (var seed in MemoryUsers)
            {
                const string upsert = """
                    INSERT INTO lw_auth_users (id, account_id, email, username, display_name, password_hash, password_salt, role, tier, bound_character)
                    VALUES (@id, @aid, @email, @uname, @dname, @hash, @salt, @role, @tier, @bound)
                    ON DUPLICATE KEY UPDATE
                        password_hash = COALESCE(NULLIF(password_hash, ''), @hash),
                        password_salt = COALESCE(NULLIF(password_salt, ''), @salt),
                        display_name = @dname;
                    """;
                await using var uCmd = new MySqlCommand(upsert, conn);
                uCmd.Parameters.AddWithValue("@id", seed.Id);
                uCmd.Parameters.AddWithValue("@aid", seed.AccountId);
                uCmd.Parameters.AddWithValue("@email", seed.Email);
                uCmd.Parameters.AddWithValue("@uname", seed.Username);
                uCmd.Parameters.AddWithValue("@dname", seed.DisplayName);
                uCmd.Parameters.AddWithValue("@hash", seed.PasswordHash);
                uCmd.Parameters.AddWithValue("@salt", seed.PasswordSalt);
                uCmd.Parameters.AddWithValue("@role", seed.Role);
                uCmd.Parameters.AddWithValue("@tier", seed.TierCode);
                uCmd.Parameters.AddWithValue("@bound", seed.BoundCharacter);
                await uCmd.ExecuteNonQueryAsync(ct);
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

        var memMatch = MemoryUsers.FirstOrDefault(u =>
            string.Equals(u.Email, cleanId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(u.Username, cleanId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(u.AccountId, cleanId, StringComparison.OrdinalIgnoreCase));

        // 1. Check jane_scrum.mw_users (production canonical user table)
        try
        {
            await using var conn = await repo.OpenConnectionAsync(ct);
            const string mwSql = """
                SELECT id, email, username, display_name, COALESCE(password_hash, ''), COALESCE(password_salt, ''),
                       COALESCE(role, 'player'), COALESCE(tier, 'adventurer')
                FROM jane_scrum.mw_users
                WHERE LOWER(email) = LOWER(@id) OR LOWER(username) = LOWER(@id)
                LIMIT 1;
                """;
            await using var mwCmd = new MySqlCommand(mwSql, conn);
            mwCmd.Parameters.AddWithValue("@id", cleanId);
            await using var mwReader = await mwCmd.ExecuteReaderAsync(ct);
            if (await mwReader.ReadAsync(ct))
            {
                var dbId = mwReader.GetInt64(0);
                var email = mwReader.GetString(1);
                var uname = mwReader.GetString(2);
                var dname = mwReader.GetString(3);
                var hash = mwReader.GetString(4);
                var salt = mwReader.GetString(5);
                var rawRole = mwReader.GetString(6);
                var tier = mwReader.GetString(7);

                var validMwPassword = !string.IsNullOrEmpty(hash) && !string.IsNullOrEmpty(salt) &&
                                      PasswordHasher.VerifyPassword(password, hash, salt);

                if (validMwPassword)
                {
                    var normalizedRole = rawRole is "player" or "players" ? "players" : "gm";
                    return new StoredUserRecord(
                        dbId,
                        memMatch?.AccountId ?? $"acc-{dbId}",
                        email,
                        uname,
                        dname,
                        hash,
                        salt,
                        normalizedRole,
                        tier,
                        memMatch?.BoundCharacter ?? (normalizedRole == "gm" ? "GM" : uname),
                        memMatch?.OwnedAssetIds ?? new[] { "asset-map-cinth", "asset-dice-runed-obsidian" },
                        memMatch?.CreatorBalanceUsd ?? 0.0
                    );
                }
            }
        }
        catch
        {
            // Continue to lw_auth_users / MemoryUsers
        }

        // 2. Check loomweaver.lw_auth_users
        try
        {
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
            if (await reader.ReadAsync(ct))
            {
                var hash = reader.IsDBNull(5) ? string.Empty : reader.GetString(5);
                var salt = reader.IsDBNull(6) ? string.Empty : reader.GetString(6);
                if (PasswordHasher.VerifyPassword(password, hash, salt))
                {
                    var rawRole = reader.GetString(7);
                    var normalizedRole = rawRole is "player" or "players" ? "players" : "gm";
                    return new StoredUserRecord(
                        memMatch?.Id ?? reader.GetInt64(0),
                        reader.GetString(1),
                        reader.GetString(2),
                        reader.GetString(3),
                        reader.GetString(4),
                        hash,
                        salt,
                        normalizedRole,
                        reader.GetString(8),
                        reader.GetString(9),
                        new[] { "asset-map-cinth", "asset-dice-runed-obsidian" },
                        0.0
                    );
                }
            }
        }
        catch
        {
            // Database unavailable: no offline credential fallback exists.
        }

        return null;
    }

    public static async Task<StoredUserRecord> RegisterAsync(
        LoomWeaverMySqlRepository repo,
        string email,
        string username,
        string displayName,
        string password,
        string role,
        CancellationToken ct = default)
    {
        await EnsureDatabaseReadyAsync(repo, ct);
        var cleanEmail = email.Trim().ToLowerInvariant();
        var cleanUser = string.IsNullOrWhiteSpace(username) ? cleanEmail.Split('@')[0] : username.Trim();
        var cleanDisplay = string.IsNullOrWhiteSpace(displayName) ? cleanUser : displayName.Trim();
        var normalizedRole = string.Equals(role, "players", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(role, "player", StringComparison.OrdinalIgnoreCase)
            ? "players"
            : "gm";

        if (MemoryUsers.Any(u =>
            string.Equals(u.Email, cleanEmail, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(u.Username, cleanUser, StringComparison.OrdinalIgnoreCase)))
        {
            throw new InvalidOperationException("An account with that email or username already exists.");
        }

        var (hash, salt) = PasswordHasher.HashPassword(password);
        var accountId = $"acc-{normalizedRole}-{Guid.NewGuid():N}"[..18];
        var newId = (long)(MemoryUsers.Count + 6000);
        var record = new StoredUserRecord(
            newId, accountId, cleanEmail, cleanUser, cleanDisplay, hash, salt,
            normalizedRole, normalizedRole == "gm" ? "adventurer" : "player",
            normalizedRole == "gm" ? "GM" : "Fivi",
            new[] { "asset-dice-runed-obsidian" }, 0.0
        );

        try
        {
            await using var conn = await repo.OpenConnectionAsync(ct);
            const string insertSql = """
                INSERT INTO lw_auth_users (account_id, email, username, display_name, password_hash, password_salt, role, tier, bound_character)
                VALUES (@aid, @email, @uname, @dname, @hash, @salt, @role, @tier, @bound);
                SELECT LAST_INSERT_ID();
                """;
            await using var cmd = new MySqlCommand(insertSql, conn);
            cmd.Parameters.AddWithValue("@aid", record.AccountId);
            cmd.Parameters.AddWithValue("@email", record.Email);
            cmd.Parameters.AddWithValue("@uname", record.Username);
            cmd.Parameters.AddWithValue("@dname", record.DisplayName);
            cmd.Parameters.AddWithValue("@hash", record.PasswordHash);
            cmd.Parameters.AddWithValue("@salt", record.PasswordSalt);
            cmd.Parameters.AddWithValue("@role", record.Role);
            cmd.Parameters.AddWithValue("@tier", record.TierCode);
            cmd.Parameters.AddWithValue("@bound", record.BoundCharacter);
            var dbId = Convert.ToInt64(await cmd.ExecuteScalarAsync(ct));
            record = record with { Id = dbId };
        }
        catch (MySqlException ex) when (ex.Number == 1062)
        {
            throw new InvalidOperationException("An account with that email or username already exists.");
        }
        catch
        {
            // Keep in-memory record when MySQL is offline locally
        }

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

            var existing = MemoryUsers.FirstOrDefault(u => string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));
            if (existing is not null) return existing;

            try
            {
                await using var conn = await repo.OpenConnectionAsync(ct);
                await using var cmd = new MySqlCommand(
                    "SELECT id, username, display_name, COALESCE(role, 'player'), COALESCE(tier, 'adventurer') FROM jane_scrum.mw_users WHERE LOWER(email) = LOWER(@email) LIMIT 1",
                    conn);
                cmd.Parameters.AddWithValue("@email", email);
                await using var r = await cmd.ExecuteReaderAsync(ct);
                if (await r.ReadAsync(ct))
                {
                    var dbId = r.GetInt64(0);
                    var rawRole = r.GetString(3);
                    return new StoredUserRecord(
                        dbId, $"acc-{dbId}", email, r.GetString(1), r.GetString(2), "", "",
                        rawRole is "player" or "players" ? "players" : "gm", r.GetString(4), "GM",
                        new[] { "asset-map-cinth" }, 0.0);
                }
            }
            catch { }

            var (hash, salt) = PasswordHasher.HashPassword(Guid.NewGuid().ToString("N"));
            var created = new StoredUserRecord(
                MemoryUsers.Count + 6200,
                $"acc-google-{Guid.NewGuid():N}"[..18],
                email, email.Split('@')[0], name, hash, salt,
                email.Equals("jtromborg1@gmail.com", StringComparison.OrdinalIgnoreCase) ? "gm" : "players",
                email.Equals("jtromborg1@gmail.com", StringComparison.OrdinalIgnoreCase) ? "legendary" : "adventurer",
                email.Equals("jtromborg1@gmail.com", StringComparison.OrdinalIgnoreCase) ? "GM" : "Dal",
                new[] { "asset-map-cinth", "asset-dice-runed-obsidian" }, 0.0
            );
            MemoryUsers.Insert(0, created);
            return created;
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
