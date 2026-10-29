using System.Text.Json;
using LoomWeaver.Domain;
using MySqlConnector;

namespace LoomWeaver.Infrastructure.MySql;

public sealed class LoomWeaverMySqlOptions
{
    public string? ConnectionString { get; set; }
    public string Server { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 3306;
    public string Database { get; set; } = "loomweaver";
    public string UserId { get; set; } = "loomweaver_app";
    public string Password { get; set; } = string.Empty;
}

public sealed class LoomWeaverMySqlRepository(LoomWeaverMySqlOptions options)
{
    public string BuildConnectionString(int? portOverride = null) =>
        !string.IsNullOrWhiteSpace(options.ConnectionString) && portOverride is null
            ? options.ConnectionString
            : new MySqlConnectionStringBuilder
            {
                Server = options.Server,
                Port = (uint)(portOverride ?? options.Port),
                Database = options.Database,
                UserID = options.UserId,
                Password = options.Password,
                SslMode = MySqlSslMode.None,
                ConnectionTimeout = 3
            }.ConnectionString;

    public async Task<MySqlConnection> OpenConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            var conn = new MySqlConnection(BuildConnectionString());
            await conn.OpenAsync(ct);
            return conn;
        }
        catch when (options.Server is "127.0.0.1" or "localhost" && options.Port == 3306)
        {
            var tunnelConn = new MySqlConnection(BuildConnectionString(3307));
            await tunnelConn.OpenAsync(ct);
            return tunnelConn;
        }
    }

    public async Task<IReadOnlyList<CampaignDto>> GetCampaignsAsync(CancellationToken ct = default)
    {
        try
        {
            await using var conn = await OpenConnectionAsync(ct);
            await using var cmd = new MySqlCommand(
                "SELECT id, slug, name, subtitle, system_code, world_name, current_act, current_session_number, current_location_name, weave_enabled FROM lw_campaigns ORDER BY id",
                conn);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var list = new List<CampaignDto>();
            while (await reader.ReadAsync(ct))
            {
                list.Add(new CampaignDto(
                    reader.GetInt32(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetString(6),
                    reader.GetInt32(7),
                    reader.GetString(8),
                    reader.GetBoolean(9)
                ));
            }
            return list;
        }
        catch
        {
            return FallbackSeedData.Campaigns;
        }
    }

    public async Task<IReadOnlyList<EntitySummaryDto>> GetAuthorizedEntitiesAsync(
        int campaignId,
        string viewerRole,
        string? entityType = null,
        CancellationToken ct = default)
    {
        var isGm = string.Equals(viewerRole, "gm", StringComparison.OrdinalIgnoreCase);
        try
        {
            await using var conn = await OpenConnectionAsync(ct);
            var sql = """
                SELECT campaign_id, entity_type, entity_key, name, subtitle, summary, visibility, canon_status, route_link
                FROM lw_entities
                WHERE campaign_id = @cid
                  AND (@isGm = 1 OR visibility IN ('public', 'players'))
                  AND (@etype IS NULL OR entity_type = @etype)
                ORDER BY entity_type, name
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            cmd.Parameters.AddWithValue("@isGm", isGm ? 1 : 0);
            cmd.Parameters.AddWithValue("@etype", (object?)entityType ?? DBNull.Value);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var list = new List<EntitySummaryDto>();
            while (await reader.ReadAsync(ct))
            {
                var cid = reader.GetInt32(0);
                var et = reader.GetString(1);
                var ek = reader.GetString(2);
                list.Add(new EntitySummaryDto(
                    $"{cid}:{et}:{ek}",
                    cid,
                    et,
                    ek,
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetString(6),
                    reader.GetString(7),
                    reader.GetString(8)
                ));
            }
            return list;
        }
        catch
        {
            return FallbackSeedData.FilterEntities(campaignId, isGm, entityType);
        }
    }

    public async Task<IReadOnlyList<AssetCardDto>> GetAssetsAsync(string? category = null, CancellationToken ct = default)
    {
        try
        {
            await using var conn = await OpenConnectionAsync(ct);
            var sql = """
                SELECT id, name, category, creator_name, entitlement, price_label, price_cents, preview_url, summary, system_code
                FROM lw_assets
                WHERE (@cat IS NULL OR category = @cat)
                ORDER BY id
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@cat", (object?)category ?? DBNull.Value);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var list = new List<AssetCardDto>();
            while (await reader.ReadAsync(ct))
            {
                list.Add(new AssetCardDto(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetString(5),
                    reader.GetInt32(6),
                    reader.IsDBNull(7) ? null : reader.GetString(7),
                    reader.GetString(8),
                    reader.GetString(9)
                ));
            }
            return list;
        }
        catch
        {
            return FallbackSeedData.Assets;
        }
    }

    public async Task<IReadOnlyList<SceneSummaryDto>> GetAuthorizedScenesAsync(int campaignId, string viewerRole, CancellationToken ct = default)
    {
        var isGm = string.Equals(viewerRole, "gm", StringComparison.OrdinalIgnoreCase);
        try
        {
            await using var conn = await OpenConnectionAsync(ct);
            var sql = """
                SELECT scene_key, campaign_id, name, region_name, mode_support, grid_cols, grid_rows, biome, weather_preset, lighting_profile, visibility, revision
                FROM lw_scenes
                WHERE campaign_id = @cid
                  AND (@isGm = 1 OR visibility IN ('public', 'players'))
                ORDER BY id
                """;
            await using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@cid", campaignId);
            cmd.Parameters.AddWithValue("@isGm", isGm ? 1 : 0);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var list = new List<SceneSummaryDto>();
            while (await reader.ReadAsync(ct))
            {
                list.Add(new SceneSummaryDto(
                    reader.GetString(0),
                    reader.GetInt32(1),
                    reader.GetString(2),
                    reader.GetString(3),
                    reader.GetString(4),
                    reader.GetInt32(5),
                    reader.GetInt32(6),
                    reader.GetString(7),
                    reader.GetString(8),
                    reader.GetString(9),
                    reader.GetString(10),
                    reader.GetInt32(11)
                ));
            }
            return list;
        }
        catch
        {
            return FallbackSeedData.Scenes.Where(s => isGm || s.Visibility != "gm").ToList();
        }
    }
}
