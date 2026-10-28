using LoomWeaver.Infrastructure.MySql;
using MySqlConnector;

namespace LoomWeaver.Modules.Bestiary;

/// <summary>
/// MySQL schema + transactional write-through helpers for the Bestiary module (loomweaver schema only).
/// MySQL is authoritative. Failed writes propagate to the caller and never update cached content.
/// </summary>
public static class BestiaryPersistence
{
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static bool _schemaReady;

    public static bool SchemaReady => _schemaReady;

    private const string Ddl = """
        CREATE TABLE IF NOT EXISTS lw_custom_monsters (
            monster_key VARCHAR(64) NOT NULL PRIMARY KEY,
            creator_user_id BIGINT NOT NULL,
            creator_username VARCHAR(64) NOT NULL,
            name VARCHAR(160) NOT NULL,
            challenge_rating VARCHAR(12) NOT NULL,
            creature_type VARCHAR(60) NOT NULL,
            is_published TINYINT(1) NOT NULL DEFAULT 0,
            price_cents INT NOT NULL DEFAULT 0,
            statblock_json LONGTEXT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_cm_creator (creator_user_id),
            INDEX idx_cm_published (is_published)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_monster_collections (
            collection_id VARCHAR(64) NOT NULL PRIMARY KEY,
            owner_user_id BIGINT NOT NULL,
            owner_username VARCHAR(64) NOT NULL,
            name VARCHAR(140) NOT NULL,
            description VARCHAR(600) NOT NULL DEFAULT '',
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_mc_owner (owner_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_monster_collection_campaigns (
            collection_id VARCHAR(64) NOT NULL,
            campaign_id INT NOT NULL,
            PRIMARY KEY (collection_id, campaign_id),
            INDEX idx_mcc_campaign (campaign_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_monster_collection_entries (
            collection_id VARCHAR(64) NOT NULL,
            monster_key VARCHAR(64) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            PRIMARY KEY (collection_id, monster_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_campaign_monster_assets (
            campaign_id INT NOT NULL,
            monster_key VARCHAR(64) NOT NULL,
            primary_token_url VARCHAR(500) NULL,
            secondary_token_url VARCHAR(500) NULL,
            primary_model_url VARCHAR(500) NULL,
            secondary_model_url VARCHAR(500) NULL,
            updated_by_user_id BIGINT NOT NULL,
            updated_by_username VARCHAR(64) NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (campaign_id, monster_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_campaign_monster_placements (
            placement_id VARCHAR(64) NOT NULL PRIMARY KEY,
            campaign_id INT NOT NULL,
            monster_key VARCHAR(64) NOT NULL,
            monster_name VARCHAR(160) NOT NULL,
            scope VARCHAR(16) NOT NULL,
            session_id VARCHAR(64) NULL,
            session_label VARCHAR(200) NULL,
            encounter_id VARCHAR(64) NULL,
            encounter_label VARCHAR(200) NULL,
            quantity INT NOT NULL DEFAULT 1,
            added_by_username VARCHAR(64) NOT NULL,
            added_at DATETIME NOT NULL,
            INDEX idx_cmp_campaign (campaign_id, monster_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        CREATE TABLE IF NOT EXISTS lw_monster_sightings (
            sighting_id VARCHAR(64) NOT NULL PRIMARY KEY,
            campaign_id INT NOT NULL,
            monster_key VARCHAR(64) NOT NULL,
            monster_name VARCHAR(160) NOT NULL,
            outcome VARCHAR(24) NOT NULL,
            session_id VARCHAR(64) NULL,
            session_label VARCHAR(200) NULL,
            location_name VARCHAR(200) NULL,
            encounter_id VARCHAR(64) NULL,
            encounter_label VARCHAR(200) NULL,
            witness_keys_json JSON NOT NULL,
            visibility VARCHAR(16) NOT NULL DEFAULT 'party',
            notes VARCHAR(1000) NULL,
            occurred_at DATETIME NOT NULL,
            recorded_by_username VARCHAR(64) NOT NULL,
            INDEX idx_ms_campaign (campaign_id, monster_key),
            INDEX idx_ms_occurred (campaign_id, occurred_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """;

    /// <summary>Creates tables (once) and loads every persisted bestiary row into the in-memory stores.</summary>
    public static async Task EnsureReadyAsync(LoomWeaverMySqlRepository mysql, CancellationToken ct = default)
    {
        if (_schemaReady) return;
        await Gate.WaitAsync(ct);
        try
        {
            if (_schemaReady) return;
            await using var conn = await mysql.OpenConnectionAsync(ct);
            await using (var cmd = new MySqlCommand(Ddl, conn))
            {
                await cmd.ExecuteNonQueryAsync(ct);
            }
            await BestiaryCreatorStore.LoadAsync(conn, ct);
            await BestiaryCampaignStore.LoadAsync(conn, ct);
            _schemaReady = true;
        }
        finally
        {
            Gate.Release();
        }
    }

    /// <summary>Executes one or more statements in a single transaction; returns false when MySQL is unavailable.</summary>
    public static async Task<bool> ExecuteAsync(
        LoomWeaverMySqlRepository mysql,
        IReadOnlyList<(string Sql, IReadOnlyDictionary<string, object?> Args)> statements,
        CancellationToken ct = default)
    {
        if (!_schemaReady) await EnsureReadyAsync(mysql, ct);
        await using var conn = await mysql.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);
        foreach (var (sql, args) in statements)
        {
            await using var cmd = new MySqlCommand(sql, conn, tx);
            foreach (var (name, value) in args) cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return true;
    }

    public static (string Sql, IReadOnlyDictionary<string, object?> Args) Stmt(string sql, params (string Name, object? Value)[] args) =>
        (sql, args.ToDictionary(a => a.Name, a => a.Value));

    public static string? ReadString(MySqlDataReader r, string column)
    {
        var i = r.GetOrdinal(column);
        return r.IsDBNull(i) ? null : Convert.ToString(r.GetValue(i));
    }

    public static DateTimeOffset ReadDate(MySqlDataReader r, string column)
    {
        var i = r.GetOrdinal(column);
        return r.IsDBNull(i) ? DateTimeOffset.UtcNow : new DateTimeOffset(DateTime.SpecifyKind(r.GetDateTime(i), DateTimeKind.Utc));
    }
}
